import { describe, it, expect } from 'vitest';
import { parseSequence } from '../src/parse/sequence';
import { layoutSequence } from '../src/layout/sequence';
import { defaultTheme } from '../src/draw/theme';
import { renderDiagram } from '../src/render';
import { measureText } from '../src/text';

const ok = (src: string) => {
  const m = parseSequence(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

function viewBoxOf(svg: string): { minX: number; minY: number; w: number; h: number } {
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!m) throw new Error('no viewBox');
  return { minX: Number(m[1]), minY: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

describe('parseSequence', () => {
  it('참가자를 등장 순서대로 모은다', () => {
    expect(ok('sequenceDiagram\n A->>B: x\n C->>A: y').actors).toEqual(['A', 'B', 'C']);
  });

  it('participant 선언이 순서를 정한다', () => {
    expect(ok('sequenceDiagram\n participant B\n participant A\n A->>B: x').actors).toEqual(['B', 'A']);
  });

  it('실선과 점선을 구분한다', () => {
    const m = ok('sequenceDiagram\n A->>B: 요청\n B-->>A: 응답');
    expect(m.steps.map((s) => s.t === 'msg' ? s.line : null)).toEqual(['solid', 'dotted']);
  });

  it('Note 를 읽는다', () => {
    const m = ok('sequenceDiagram\n A->>B: x\n Note over B: 검증한다');
    expect(m.steps[1]).toMatchObject({ t: 'note', at: 'B', label: '검증한다' });
  });

  it('alt 블록은 아직 못 읽는다고 알린다', () => {
    expect(parseSequence('sequenceDiagram\n alt 성공\n A->>B: x\n end')).toHaveProperty('error');
  });
});

describe('layoutSequence', () => {
  const m = ok('sequenceDiagram\n A->>B: x\n B->>C: y');
  const lay = layoutSequence(m, defaultTheme());

  it('참가자가 선언 순서대로 왼쪽부터 놓인다', () => {
    expect(lay.x.get('A')!).toBeLessThan(lay.x.get('B')!);
    expect(lay.x.get('B')!).toBeLessThan(lay.x.get('C')!);
  });

  it('메시지가 위에서 아래로 쌓인다', () => {
    expect(lay.rowY[1]!).toBeGreaterThan(lay.rowY[0]!);
  });
});

describe('sequence 렌더', () => {
  const r = renderDiagram('%% caption: 결제 흐름\nsequenceDiagram\n 주문->>결제: 승인 요청\n 결제-->>주문: 승인');

  it('그려진다', () => {
    expect(r.svg).toContain('<svg');
    expect(r.warnings).toHaveLength(0);
  });

  it('참가자 상자와 생명선을 그린다', () => {
    expect((r.svg!.match(/<rect/g) ?? []).length).toBe(2);
    expect((r.svg!.match(/<line/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('점선 응답을 dasharray 로 낸다', () => {
    expect(r.svg).toContain('stroke-dasharray');
  });

  it('금지 태그가 없다', () => {
    for (const t of ['<style', '<script', '<use', '<foreignObject']) expect(r.svg).not.toContain(t);
  });
});

// task 13 에서 발견·수정했지만 임시 probe 파일로만 검증하고 지운 문제 3건을
// 영구 테스트로 고정한다 — 다음 리팩터가 되돌려도 여기서 잡힌다.
describe('drawSequence — task 13 회귀 고정', () => {
  it('자기 메시지는 고리를 그리고 마지막 구간이 생명선으로 되돌아간다', () => {
    const svg = renderDiagram('%% caption: 재시도\nsequenceDiagram\n A->>A: 재시도').svg!;
    const vb = viewBoxOf(svg);
    const poly = /<polyline points="([^"]+)"/.exec(svg);
    expect(poly).not.toBeNull();
    const pts = poly![1]!.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    expect(pts).toHaveLength(4);
    const first = pts[0]!, last = pts[3]!;
    // 고리는 생명선에서 나가 사각형을 돌아 같은 x(생명선)로 돌아온다 —
    // 마지막 점의 x 가 첫 점과 같아야 "되돌아간" 것이다.
    expect(last[0]).toBeCloseTo(first[0], 1);
    expect(last[1]).not.toBeCloseTo(first[1], 1);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(vb.minX - 0.5);
      expect(x).toBeLessThanOrEqual(vb.minX + vb.w + 0.5);
      expect(y).toBeGreaterThanOrEqual(vb.minY - 0.5);
      expect(y).toBeLessThanOrEqual(vb.minY + vb.h + 0.5);
    }
  });

  it('Note over A,B 는 문서화된 대로 첫 참가자 위에만 놓인다', () => {
    const m = ok('sequenceDiagram\n A->>B: x\n Note over A,B: 확인');
    expect(m.steps[1]).toMatchObject({ t: 'note', at: 'A', label: '확인' });
  });

  it('중간 참가자를 건너뛰는 메시지도 라벨이 두 생명선 사이에 들어간다', () => {
    const label = '이 메시지는 중간 참가자 하나를 건너뛰고 도착하는 아주 길게 설명하는 라벨이다';
    const m = ok(`sequenceDiagram\n participant A\n participant B\n participant C\n A->>C: ${label}`);
    const theme = defaultTheme();
    const lay = layoutSequence(m, theme);
    const span = lay.x.get('C')! - lay.x.get('A')!;
    // 건너뛴 열 개수(need/span)로 나누던 옛 버전은 필요 폭을 깎아 라벨이
    // 옆 생명선과 겹쳤다 — 나눗셈이 돌아오면 이 부등식이 깨진다.
    expect(span).toBeGreaterThanOrEqual(measureText(label, theme.labelSize));
  });

  it('인접한 두 참가자 사이 긴 라벨도 두 생명선 사이에 들어간다', () => {
    const label = '인접한 두 참가자 사이에 놓이는 아주 길게 설명하는 라벨이다';
    const m = ok(`sequenceDiagram\n A->>B: ${label}`);
    const theme = defaultTheme();
    const lay = layoutSequence(m, theme);
    const span = lay.x.get('B')! - lay.x.get('A')!;
    expect(span).toBeGreaterThanOrEqual(measureText(label, theme.labelSize));
  });
});
