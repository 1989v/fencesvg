import { describe, it, expect } from 'vitest';
import { parseSequence } from '../src/parse/sequence';
import { layoutSequence } from '../src/layout/sequence';
import { defaultTheme } from '../src/draw/theme';
import { renderDiagram } from '../src/render';

const ok = (src: string) => {
  const m = parseSequence(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

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
