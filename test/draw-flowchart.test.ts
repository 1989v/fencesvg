import { describe, it, expect } from 'vitest';
import { parseFlowchart } from '../src/parse/flowchart';
import { drawFlowchart } from '../src/draw/flowchart';
import { defaultTheme } from '../src/draw/theme';

const draw = (src: string, accent?: string) => {
  const m = parseFlowchart(src);
  if ('error' in m) throw new Error(m.error);
  return drawFlowchart(m, defaultTheme(accent), 'd1', '설명');
};

describe('drawFlowchart', () => {
  const out = draw('flowchart LR\n A[주문] -->|승인| B{결제}\n B -.-> C(취소)\n class C emphasis');

  it('노드마다 도형이 하나씩 나온다', () => {
    expect((out.match(/<rect/g) ?? []).length).toBe(2);   // 사각 + 둥근
    expect((out.match(/<polygon/g) ?? []).length).toBeGreaterThanOrEqual(1); // 마름모 + 화살촉
  });

  it('선 색을 currentColor 로 낸다', () => {
    expect(out).toContain('stroke="currentColor"');
  });

  it('강조 노드만 accent 를 쓴다', () => {
    expect((out.match(/var\(--accent\)/g) ?? []).length).toBeGreaterThan(0);
  });

  it('점선은 stroke-dasharray 로 낸다', () => {
    expect(out).toContain('stroke-dasharray');
  });

  it('화살촉 marker 의 id 에 접두어가 붙는다', () => {
    expect(out).toContain('id="d1-arrow"');
    expect(out).toContain('marker-end="url(#d1-arrow)"');
  });

  it('간선 라벨이 들어간다', () => {
    expect(out).toContain('>승인<');
  });

  it('빈 줄이 없고 한 줄에 요소 하나씩이다', () => {
    expect(out.split('\n').every((l) => l.trim().length > 0)).toBe(true);
  });

  it('금지 태그가 없다', () => {
    for (const t of ['<style', '<script', '<use', '<foreignObject']) expect(out).not.toContain(t);
  });

  it('결정적이다', () => {
    const a = draw('flowchart LR\n A[주문] --> B[결제]');
    const b = draw('flowchart LR\n A[주문] --> B[결제]');
    expect(a).toBe(b);
  });

  it('accent 를 바꾸면 출력이 따라간다', () => {
    expect(draw('flowchart LR\n A[a] --> B[b]\n class B emphasis', 'var(--ko-accent-primary)'))
      .toContain('var(--ko-accent-primary)');
  });
});

/** viewBox="x y w h" 와 도형 태그들이 낸 모든 좌표점을 뽑아낸다 */
function points(out: string): { box: [number, number, number, number]; pts: [number, number][] } {
  const box = /viewBox="([^"]+)"/.exec(out)![1]!.split(' ').map(Number) as [number, number, number, number];
  const pts: [number, number][] = [];
  for (const m of out.matchAll(/points="([^"]+)"/g)) {
    for (const pair of m[1]!.split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      pts.push([x!, y!]);
    }
  }
  for (const m of out.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)) {
    const [x, y, w, h] = [1, 2, 3, 4].map((i) => Number(m[i]));
    pts.push([x!, y!], [x! + w!, y! + h!]);
  }
  return { box, pts };
}

describe('drawFlowchart — 역방향 우회선', () => {
  it('순환이 있으면 역방향 간선이 5점 경로로 나오고, 그 점이 전부 viewBox 안에 있다', () => {
    // A --> B --> C 다음 C -.-> B 는 레이아웃 랭크상 역방향이 되어 상자를 우회한다
    const out = draw('flowchart LR\n A[start] --> B[retry] --> C[done]\n C -.-> B');
    const backEdgePolyline = out.split('\n').find((l) => l.startsWith('<polyline') && (l.match(/,/g) ?? []).length >= 5);
    expect(backEdgePolyline).toBeDefined(); // 5점 경로 = 콤마 5개

    const { box: [vx, vy, vw, vh], pts } = points(out);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(vx);
      expect(x).toBeLessThanOrEqual(vx + vw);
      expect(y).toBeGreaterThanOrEqual(vy);
      expect(y).toBeLessThanOrEqual(vy + vh);
    }
  });
});

type Pt = [number, number];

/** 폴리곤 points 속성을 4점 튜플로 파싱한다(마름모 전용 — top,right,bottom,left 순) */
function parseDiamond(pointsAttr: string): [Pt, Pt, Pt, Pt] {
  const [top, right, bottom, left] = pointsAttr.split(' ').map((p) => p.split(',').map(Number) as Pt);
  return [top!, right!, bottom!, left!];
}

describe('drawFlowchart — 마름모 라벨', () => {
  /** 마름모(top,right,bottom,left) 4점에서 y 지점의 사용 가능한 반폭을 구한다 */
  function diamondHalfWidthAt(quad: [Pt, Pt, Pt, Pt], y: number): number {
    const [top, right] = quad;
    const cx = top[0], cy = right[1];
    const halfH = right[1] - top[1];
    const halfW = right[0] - cx;
    const dy = Math.abs(y - cy);
    return Math.max(0, 1 - dy / halfH) * halfW;
  }

  it('짧은 라벨은 마름모 안에 들어간다', () => {
    const out = draw('flowchart LR\n A[a] --> B{결제}');
    const lines = out.split('\n');
    const polyIdx = lines.findIndex((l) => l.startsWith('<polygon') && l.includes('fill="none"'));
    const quad = parseDiamond(/points="([^"]+)"/.exec(lines[polyIdx]!)![1]!);
    const tm = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/.exec(lines[polyIdx + 1]!)!;
    const [tx, baseY, label] = [Number(tm[1]), Number(tm[2]), tm[3]!];
    const textHalfW = ([...label].length * 13 * 1.0) / 2; // 한글은 전각 근사(1em)
    const capTop = baseY - 13 * 0.72, descBot = baseY + 13 * 0.2;
    const worst = Math.min(diamondHalfWidthAt(quad, capTop), diamondHalfWidthAt(quad, descBot));
    expect(tx).toBeCloseTo((quad[0][0] + quad[2][0]) / 2, 0); // 텍스트는 마름모 중심에 온다
    expect(textHalfW).toBeLessThanOrEqual(worst);
  });

  it('20자 이상의 긴 한글 라벨도 상자가 늘어나 마름모 안에 들어간다', () => {
    const label = '가나다라마바사아자차카타파하거너더러머'; // 20자
    const out = draw(`flowchart LR\n A[a] --> B{${label}}`);
    const lines = out.split('\n');
    const polyIdx = lines.findIndex((l) => l.startsWith('<polygon') && l.includes('fill="none"'));
    const quad = parseDiamond(/points="([^"]+)"/.exec(lines[polyIdx]!)![1]!);
    const tm = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/.exec(lines[polyIdx + 1]!)!;
    const [baseY, textLabel] = [Number(tm[2]), tm[3]!];
    expect(textLabel).toBe(label);
    const textHalfW = ([...textLabel].length * 13 * 1.0) / 2;
    const capTop = baseY - 13 * 0.72, descBot = baseY + 13 * 0.2;
    const worst = Math.min(diamondHalfWidthAt(quad, capTop), diamondHalfWidthAt(quad, descBot));
    expect(textHalfW).toBeLessThanOrEqual(worst);
  });
});

describe('drawFlowchart — 경계 사례', () => {
  it('빈 라벨(A[]) 노드도 예외 없이 렌더되고 빈 줄이 안 생긴다', () => {
    const out = draw('flowchart LR\n A[] --> B[b]');
    expect(out).toContain('<rect');
    expect(out).toMatch(/<text[^>]*><\/text>/);
    expect(out.split('\n').every((l) => l.trim().length > 0)).toBe(true);
  });

  it('idPrefix 가 다른 두 다이어그램은 marker id 를 공유하지 않는다', () => {
    const src = 'flowchart LR\n A[a] --> B[b]';
    const m = parseFlowchart(src);
    if ('error' in m) throw new Error(m.error);
    const out1 = drawFlowchart(m, defaultTheme(), 'd1', '설명');
    const out2 = drawFlowchart(m, defaultTheme(), 'd2', '설명');
    expect(out1).toContain('id="d1-arrow"');
    expect(out2).toContain('id="d2-arrow"');
    expect(out1).not.toContain('id="d2-arrow"');
    expect(out2).not.toContain('id="d1-arrow"');
  });

  it('emphasis 노드 자신에 붙은 간선은 accent 를 타지 않고 currentColor 로 남는다', () => {
    const out = draw('flowchart LR\n A[a] --> B[b]\n class B emphasis');
    const polylineLines = out.split('\n').filter((l) => l.startsWith('<polyline'));
    expect(polylineLines.length).toBeGreaterThan(0);
    for (const l of polylineLines) {
      expect(l).toContain('stroke="currentColor"');
      expect(l).not.toContain('var(--accent)');
    }
    // 노드 B 자체는 accent 를 쓴다
    const rectLines = out.split('\n').filter((l) => l.startsWith('<rect'));
    expect(rectLines.some((l) => l.includes('var(--accent)'))).toBe(true);
  });
});
