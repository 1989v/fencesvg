import { describe, it, expect } from 'vitest';
import { parseFlowchart } from '../src/parse/flowchart';
import { drawFlowchart } from '../src/draw/flowchart';
import { defaultTheme } from '../src/draw/theme';
import { measureText } from '../src/text';

const draw = (src: string, accent?: string) => {
  const m = parseFlowchart(src);
  if ('error' in m) throw new Error(m.error);
  return drawFlowchart(m, defaultTheme(accent), 'd1', '설명');
};

describe('drawFlowchart', () => {
  const out = draw('flowchart LR\n A[주문] -->|승인| B{결제}\n B -.-> C(취소)\n class C emphasis');

  it('노드마다 도형이 하나씩 나온다', () => {
    // 사각(A) + 둥근(C) + 간선 라벨("승인") 배경 칩까지 rect 셋
    expect((out.match(/<rect/g) ?? []).length).toBe(3);
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
  // 간선은 이제 <path d="M … L … Q …">다 — 각 커맨드의 좌표쌍을 순서대로
  // 뽑는다(Q 의 제어점도 포함: 2차 베지어는 시작·제어·끝점의 볼록 껍질을
  // 벗어나지 않으므로, 그 점들이 전부 viewBox 안이면 곡선도 안이다).
  for (const m of out.matchAll(/<path[^>]*\bd="([^"]+)"/g)) {
    const nums = (m[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i]!, nums[i + 1]!]);
  }
  return { box, pts };
}

/**
 * `<text>` 요소마다 x/y/font-size/내용을 읽어 실제 차지하는 바운딩 박스를
 * 구한다(가운데 정렬 전제 — 이 파일이 그리는 모든 텍스트가 middle 앵커다).
 * drawFlowchart 가 쓰는 것과 같은 measureText·캡하이트·디센더 근사를 그대로
 * 재사용해, 도형 좌표만 보던 points() 로는 못 잡는 라벨 오버플로를 잡는다.
 */
function textBoxes(out: string): { minX: number; maxX: number; minY: number; maxY: number }[] {
  const boxes: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
  for (const m of out.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)) {
    const cx = Number(m[1]), baseY = Number(m[2]), fontSize = Number(m[3]), content = m[4]!;
    const halfW = measureText(content, fontSize) / 2;
    boxes.push({ minX: cx - halfW, maxX: cx + halfW, minY: baseY - fontSize * 0.8, maxY: baseY + fontSize * 0.25 });
  }
  return boxes;
}

/** 도형 좌표점과 텍스트 박스가 전부 viewBox 안에 있는지 확인한다 */
function assertAllContentWithinViewBox(out: string): void {
  const { box: [vx, vy, vw, vh], pts } = points(out);
  for (const [x, y] of pts) {
    expect(x).toBeGreaterThanOrEqual(vx);
    expect(x).toBeLessThanOrEqual(vx + vw);
    expect(y).toBeGreaterThanOrEqual(vy);
    expect(y).toBeLessThanOrEqual(vy + vh);
  }
  for (const b of textBoxes(out)) {
    expect(b.minX).toBeGreaterThanOrEqual(vx);
    expect(b.maxX).toBeLessThanOrEqual(vx + vw);
    expect(b.minY).toBeGreaterThanOrEqual(vy);
    expect(b.maxY).toBeLessThanOrEqual(vy + vh);
  }
}

describe('drawFlowchart — 역방향 우회선', () => {
  it('순환이 있으면 역방향 간선이 5점 경로로 나오고, 그 점이 전부 viewBox 안에 있다', () => {
    // A --> B --> C 다음 C -.-> B 는 레이아웃 랭크상 역방향이 되어 상자를 우회한다
    const out = draw('flowchart LR\n A[start] --> B[retry] --> C[done]\n C -.-> B');
    // 5점 경로 = 내부 꺾임 3개 = <path d="…"> 안의 Q(둥근 모서리) 커맨드 3개
    const backEdgePath = out.split('\n').find((l) => l.startsWith('<path') && (l.match(/Q /g) ?? []).length >= 3);
    expect(backEdgePath).toBeDefined();

    assertAllContentWithinViewBox(out);
  });
});

describe('drawFlowchart — 라벨이 viewBox 밖으로 안 나간다', () => {
  it('세로 방향(TD)에서 상자 폭보다 긴 간선 라벨도 잘리지 않는다', () => {
    // 라벨이 상자보다 훨씬 넓으면 앵커(상자 중심 x) 좌우로 흘러넘친다
    const out = draw('flowchart TD\n A[가] -->|아주 긴 간선 라벨을 붙여 본다| B[나]');
    assertAllContentWithinViewBox(out);
  });

  it('순환 다이어그램에서 맨 위 간선 라벨의 윗변도 잘리지 않는다', () => {
    // 역방향 우회선의 라벨은 차선 위(y 가 작은 쪽)에 놓이는데, 캡하이트만큼
    // 더 위로 올라간 실제 텍스트 상단이 고정 pad=4 를 넘어설 수 있었다
    const out = draw('flowchart LR\n A[주문] -->|승인| B{결제}\n B -.-> C(취소)\n C --> A');
    assertAllContentWithinViewBox(out);
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
    const polyIdx = lines.findIndex((l) => l.startsWith('<polygon')); // 마름모(다이어그램 최상위 polygon) — 화살촉은 <defs> 줄 안에 중첩돼 있어 안 걸린다
    const quad = parseDiamond(/points="([^"]+)"/.exec(lines[polyIdx]!)![1]!);
    const tm = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/.exec(lines[polyIdx + 1]!)!;
    const [tx, baseY, label] = [Number(tm[1]), Number(tm[2]), tm[3]!];
    const textHalfW = ([...label].length * 12 * 1.0) / 2; // 한글은 전각 근사(1em)
    const capTop = baseY - 12 * 0.72, descBot = baseY + 12 * 0.2;
    const worst = Math.min(diamondHalfWidthAt(quad, capTop), diamondHalfWidthAt(quad, descBot));
    expect(tx).toBeCloseTo((quad[0][0] + quad[2][0]) / 2, 0); // 텍스트는 마름모 중심에 온다
    expect(textHalfW).toBeLessThanOrEqual(worst);
  });

  it('20자 이상의 긴 한글 라벨도 상자가 늘어나 마름모 안에 들어간다', () => {
    const label = '가나다라마바사아자차카타파하거너더러머'; // 20자
    const out = draw(`flowchart LR\n A[a] --> B{${label}}`);
    const lines = out.split('\n');
    const polyIdx = lines.findIndex((l) => l.startsWith('<polygon')); // 마름모(다이어그램 최상위 polygon) — 화살촉은 <defs> 줄 안에 중첩돼 있어 안 걸린다
    const quad = parseDiamond(/points="([^"]+)"/.exec(lines[polyIdx]!)![1]!);
    const tm = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/.exec(lines[polyIdx + 1]!)!;
    const [baseY, textLabel] = [Number(tm[2]), tm[3]!];
    expect(textLabel).toBe(label);
    const textHalfW = ([...textLabel].length * 12 * 1.0) / 2;
    const capTop = baseY - 12 * 0.72, descBot = baseY + 12 * 0.2;
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
    const edgeLines = out.split('\n').filter((l) => l.startsWith('<path'));
    expect(edgeLines.length).toBeGreaterThan(0);
    for (const l of edgeLines) {
      expect(l).toContain('stroke="currentColor"');
      expect(l).not.toContain('var(--accent)');
    }
    // 노드 B 자체는 accent 를 쓴다
    const rectLines = out.split('\n').filter((l) => l.startsWith('<rect'));
    expect(rectLines.some((l) => l.includes('var(--accent)'))).toBe(true);
  });
});
