// `<br>` 로 나눈 여러 줄 라벨. 판정은 그려진 좌표로 한다 — tspan 이 있다는 것과
// 글자가 상자 안에 들어갔다는 것은 다른 사실이다.
import { describe, it, expect } from 'vitest';
import { renderDiagram } from '../src/render';
import { splitLines, measureText, extraLineHeight } from '../src/text';

const bboxOf = (svg: string) =>
  /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!.slice(1).map(Number) as [number, number, number, number];

/** 모든 text/tspan 의 기준선이 viewBox 안에 있는가. */
function textInside(svg: string): string[] {
  const [vx, vy, vw, vh] = bboxOf(svg);
  const bad: string[] = [];
  for (const m of svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    let y = Number(m[2]);
    const dys = [...m[3]!.matchAll(/dy="([-\d.]+)"/g)].map((d) => Number(d[1]));
    const ys = dys.length ? dys.map((d) => (y += d)) : [y];
    for (const by of ys) if (by < vy || by > vy + vh) bad.push(`y=${by}`);
    const x = Number(m[1]);
    if (x < vx || x > vx + vw) bad.push(`x=${x}`);
  }
  return bad;
}

describe('줄 나누기', () => {
  it('<br> · <br/> · <br /> · 대문자 · 개행을 전부 줄바꿈으로 본다', () => {
    expect(splitLines('a<br>b<br/>c<br />d<BR>e\nf')).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('폭은 가장 긴 줄이다', () => {
    expect(measureText('짧다<br>이건 훨씬 길다', 12)).toBe(measureText('이건 훨씬 길다', 12));
  });

  it('한 줄이면 추가 높이가 0 이다', () => {
    expect(extraLineHeight('한 줄', 12)).toBe(0);
  });
});

describe('여러 줄 라벨이 그려진다', () => {
  const cases: Array<[string, string]> = [
    ['flowchart 노드', '%% caption: x\nflowchart LR\n  A[첫 줄<br>둘째 줄<br>셋째 줄] --> B{판단<br>여부}'],
    ['flowchart 간선 라벨', '%% caption: x\nflowchart LR\n  A -->|위<br>아래| B'],
    ['state 전이 라벨', '%% caption: x\nstateDiagram-v2\n  [*] --> 대기: 시작<br>전이'],
    ['sequence 메시지', '%% caption: x\nsequenceDiagram\n  A->>B: 요청<br>둘째 줄'],
    ['sequence 참가자(as)', '%% caption: x\nsequenceDiagram\n  participant A as 주문<br>서비스\n  A->>B: x'],
    ['er 엔티티', '%% caption: x\nerDiagram\n  A ||--o{ B : x'],
    ['class 이름', '%% caption: x\nclassDiagram\n  class Payment\n  class Card'],
  ];
  for (const [name, src] of cases) {
    it(`${name} — <br> 이 글자로 남지 않는다`, () => {
      const r = renderDiagram(src);
      expect(r.svg, r.warnings.join(' | ')).not.toBeNull();
      expect(r.svg).not.toMatch(/&lt;br/i);
    });
    it(`${name} — 글자가 viewBox 안에 있다`, () => {
      const bad = textInside(renderDiagram(src).svg!);
      expect(bad, `넘친 기준선: ${bad.join(' ')}`).toEqual([]);
    });
  }

  it('노드 상자가 줄 수만큼 커진다', () => {
    const h = (src: string) => Number(/<rect[^>]*height="([\d.]+)"/.exec(renderDiagram(src).svg!)![1]);
    const one = h('%% caption: x\nflowchart LR\n  A[한 줄]');
    const three = h('%% caption: x\nflowchart LR\n  A[하나<br>둘<br>셋]');
    // 두 줄 추가 = 2 × 12 × 1.25 = 30, 4px 격자 스냅으로 ±4.
    expect(three - one).toBeGreaterThanOrEqual(28);
    expect(three - one).toBeLessThanOrEqual(34);
  });

  it('세 줄이면 tspan 셋이고 첫 줄만 위로 올라간다', () => {
    const svg = renderDiagram('%% caption: x\nflowchart LR\n  A[하나<br>둘<br>셋]').svg!;
    const dys = [...svg.matchAll(/dy="([-\d.]+)"/g)].map((m) => Number(m[1]));
    expect(dys).toHaveLength(3);
    expect(dys[0]).toBeLessThan(0);
    expect(dys[1]).toBeGreaterThan(0);
    expect(dys[1]).toBe(dys[2]);
  });

  it('participant A as 표시명 — 메시지는 id 로, 화면은 표시명으로', () => {
    const svg = renderDiagram('%% caption: x\nsequenceDiagram\n  participant A as 주문<br>서비스\n  A->>B: 요청').svg!;
    expect(svg).toContain('<tspan');
    expect(svg).toContain('>주문</tspan>');
    expect(svg).toContain('>서비스</tspan>');
  });

  it('두 줄 참가자 이름이 상자 안에 들어간다 — 머리 높이가 같이 자란다', () => {
    // 라이브에서 잡힌 것: 노드는 키웠는데 순차도 참가자 상자는 고정이라 두 줄 이름이 넘쳤다.
    const svg = renderDiagram('%% caption: x\nsequenceDiagram\n  participant A as 주문<br>서비스\n  participant B\n  A->>B: x').svg!;
    const box = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*rx="(?!3")/.exec(svg)!.slice(1).map(Number) as number[];
    const t = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/.exec(svg)!;
    let y = Number(t[2]);
    const ys = [...t[3]!.matchAll(/dy="([-\d.]+)"/g)].map((d) => (y += Number(d[1])));
    expect(ys).toHaveLength(2);
    // 글리프는 기준선 위 0.8em, 아래 0.25em(하강부)까지 차지한다. 하강부를 빼면
    // 12px 에서 두 줄이 아슬아슬하게 들어가 이 검사가 회귀를 못 잡는다(실제로 그랬다).
    const fs = 12;
    expect(Math.min(...ys) - fs * 0.8, '위로 넘침').toBeGreaterThanOrEqual(box[1]!);
    expect(Math.max(...ys) + fs * 0.25, '아래로 넘침').toBeLessThanOrEqual(box[1]! + box[3]!);
  });

  it('한 줄 라벨의 출력은 tspan 없이 전과 같다', () => {
    const svg = renderDiagram('%% caption: x\nflowchart LR\n  A[한 줄] --> B').svg!;
    expect(svg).not.toContain('<tspan');
  });
});
