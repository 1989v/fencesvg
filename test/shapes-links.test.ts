// mermaid 의 노드 모양·연결선 전종을 받는지 본다.
// 판정 근거는 파서가 돌려준 값과 **그려진 SVG 요소**다 — 문법이 통과했다는
// 것과 그 모양이 실제로 그려졌다는 것은 다른 사실이다.
import { describe, it, expect } from 'vitest';
import { parseFlowchart } from '../src/parse/flowchart';
import { drawFlowchart } from '../src/draw/flowchart';
import { defaultTheme } from '../src/draw/theme';

const ok = (src: string) => {
  const m = parseFlowchart(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};
const draw = (src: string) => drawFlowchart(ok(src), defaultTheme(), 'd', '설명');

describe('노드 모양 8종', () => {
  const src = `flowchart LR
  A[사각형] --> B(둥근)
  B --> C([스타디움])
  C --> D[[서브루틴]]
  D --> E[(저장소)]
  E --> F((원))
  F --> G{판단}
  G --> H{{육각형}}`;

  it('원문 모양을 그대로 구분해 읽는다', () => {
    expect(ok(src).nodes.map((n) => n.shape)).toEqual(
      ['rect', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'diamond', 'hexagon'],
    );
  });

  it('라벨을 괄호 밖으로 흘리지 않는다', () => {
    expect(ok(src).nodes.map((n) => n.label)).toEqual(
      ['사각형', '둥근', '스타디움', '서브루틴', '저장소', '원', '판단', '육각형'],
    );
  });

  it('모양마다 다른 요소로 그려진다', () => {
    const out = draw(src);
    // 원은 circle, 마름모·육각형은 polygon, 실린더는 path, 서브루틴은 g 로 묶는다.
    expect(out).toMatch(/<circle /);
    expect(out).toMatch(/<polygon /);
    expect(out).toMatch(/<path d="M /);
    expect(out).toMatch(/<g>/);
  });
});

describe('연결선 전종', () => {
  const src = `flowchart LR
  A --> B
  B --- C
  C -.-> D
  D -.- E
  E ==> F
  F --o G
  G --x H
  H <--> I`;
  const m = ok(src);

  it('선 종류를 읽는다', () => {
    expect(m.edges.map((e) => e.line)).toEqual(
      ['solid', 'solid', 'dotted', 'dotted', 'thick', 'solid', 'solid', 'solid'],
    );
  });

  it('화살촉 종류를 읽는다', () => {
    expect(m.edges.map((e) => e.head)).toEqual(
      ['arrow', 'none', 'arrow', 'none', 'arrow', 'circle', 'cross', 'arrow'],
    );
  });

  it('양방향만 시작 쪽 화살촉을 갖는다', () => {
    expect(m.edges.map((e) => e.backHead ?? '-')).toEqual(
      ['-', '-', '-', '-', '-', '-', '-', 'arrow'],
    );
  });

  it('굵은선은 실제로 굵게 그려진다', () => {
    expect(draw(src)).toMatch(/stroke-width="2"/);
  });

  it('화살표 없는 연결선에는 marker-end 를 안 붙인다', () => {
    const open = draw('flowchart LR\n  A --- B');
    expect(open).not.toMatch(/marker-end/);
  });

  it('쓰지 않은 화살촉은 정의하지 않는다', () => {
    const plain = draw('flowchart LR\n  A --> B');
    const ids = [...plain.matchAll(/<marker id="([^"]+)"/g)].map((x) => x[1]);
    expect(ids).toEqual(['d-arrow']);
  });

  it('쓴 화살촉은 전부 정의한다', () => {
    const ids = [...draw(src).matchAll(/<marker id="([^"]+)"/g)].map((x) => x[1]).sort();
    expect(ids).toEqual(['d-arrow', 'd-back', 'd-circle', 'd-cross']);
  });

  it('길이를 늘린 연결선도 같은 뜻이다 — `---->` 는 `-->` 와 같다', () => {
    const long = ok('flowchart LR\n  A ----> B').edges[0]!;
    expect([long.line, long.head]).toEqual(['solid', 'arrow']);
  });
});
