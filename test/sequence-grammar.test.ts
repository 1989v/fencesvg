// 순차도의 화살표 전종 · activation · autonumber.
import { describe, it, expect } from 'vitest';
import { parseSequence } from '../src/parse/sequence';
import { drawSequence } from '../src/draw/sequence';
import { defaultTheme } from '../src/draw/theme';

const ok = (src: string) => {
  const m = parseSequence(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

const SRC = `sequenceDiagram
  autonumber
  participant A
  participant B
  participant C
  A->>B: 요청
  activate B
  B->>C: 조회
  activate C
  C-->>B: 결과
  deactivate C
  B-)A: 비동기 통지
  B--xA: 실패
  deactivate B
  A->B: 화살촉 없음`;

describe('화살표 전종', () => {
  const m = ok(SRC);
  const msgs = m.steps.filter((s) => s.t === 'msg') as Extract<typeof m.steps[number], { t: 'msg' }>[];

  it('끝 모양 4종을 구분한다', () => {
    expect(msgs.map((s) => s.head)).toEqual(['arrow', 'arrow', 'arrow', 'async', 'cross', 'none']);
  });

  it('대시 두 개면 점선이다', () => {
    expect(msgs.map((s) => s.line)).toEqual(['solid', 'solid', 'dotted', 'solid', 'dotted', 'solid']);
  });

  it('쓴 화살촉만 정의한다', () => {
    const ids = [...drawSequence(m, defaultTheme(), 'd', 'x').matchAll(/<marker id="([^"]+)"/g)].map((x) => x[1]!).sort();
    expect(ids).toEqual(['d-arrow', 'd-async', 'd-cross']);
  });

  it('화살촉 없는 메시지에는 marker-end 를 안 붙인다', () => {
    const out = drawSequence(ok('sequenceDiagram\n  A->B: 평선'), defaultTheme(), 'd', 'x');
    expect(out).not.toMatch(/marker-end/);
  });
});

describe('autonumber', () => {
  it('메시지에만 순번을 매긴다 — 노트와 activation 은 세지 않는다', () => {
    const m = ok(SRC);
    const nums = m.steps.filter((s) => s.t === 'msg').map((s) => (s as { num?: number }).num);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('안 켜면 라벨이 그대로다', () => {
    const m = ok('sequenceDiagram\n  A->>B: 요청');
    const out = drawSequence(m, defaultTheme(), 'd', 'x');
    expect(out).toContain('>요청<');
    expect(out).not.toContain('1. 요청');
  });

  it('켜면 라벨 앞에 순번이 붙는다', () => {
    expect(drawSequence(ok(SRC), defaultTheme(), 'd', 'x')).toContain('1. 요청');
  });
});

describe('activation', () => {
  const out = drawSequence(ok(SRC), defaultTheme(), 'd', 'x');

  it('활성 구간마다 상자를 그린다', () => {
    expect([...out.matchAll(/rx="2"/g)].length).toBe(2);
  });

  it('activate/deactivate 는 행을 차지하지 않는다 — 메시지 6개면 행도 6개다', () => {
    const lines = [...out.matchAll(/<line [^>]*marker-end|<line [^>]*x1="[\d.]+" y1="([\d.]+)" x2/g)];
    // 메시지 선의 y 좌표 집합이 곧 행이다
    const ys = new Set([...out.matchAll(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="\1"/g)].map((x) => x[1]));
    expect(lines.length).toBeGreaterThan(0);
    expect(ys.size).toBe(6);
  });

  it('활성 상자가 viewBox 를 넘지 않는다', () => {
    const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(out)!.slice(1).map(Number) as number[];
    const over: string[] = [];
    for (const r of out.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const [x, y, w, h] = r.slice(1).map(Number) as number[];
      if (x! < vb[0]! - 0.5 || y! < vb[1]! - 0.5 || x! + w! > vb[0]! + vb[2]! + 0.5 || y! + h! > vb[1]! + vb[3]! + 0.5) {
        over.push(`rect(${x},${y},${w},${h})`);
      }
    }
    expect(over, `넘친 상자: ${over.join(' ')}`).toEqual([]);
  });

  it('안 닫힌 activate 도 그림을 포기하지 않는다', () => {
    const m = ok('sequenceDiagram\n  A->>B: 하나\n  activate B\n  B->>A: 둘');
    expect(() => drawSequence(m, defaultTheme(), 'd', 'x')).not.toThrow();
    expect(drawSequence(m, defaultTheme(), 'd', 'x')).toMatch(/rx="2"/);
  });
});
