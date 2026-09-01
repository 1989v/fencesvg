// 순차도 프레임 블록(alt · else · loop · opt · par · critical · break).
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
  participant A
  participant B
  participant C
  A->>B: 요청
  alt 재고 있음
    B->>C: 예약
    C-->>B: 완료
  else 재고 없음
    B->>A: 품절 안내
  end
  loop 3회
    A->>B: 재시도
  end
  B-->>A: 응답`;

describe('프레임 블록', () => {
  const m = ok(SRC);
  const out = drawSequence(m, defaultTheme(), 'd', 'x');

  it('여는 줄 · 갈래 · 닫는 줄을 각각 읽는다', () => {
    expect(m.steps.map((s) => s.t)).toEqual([
      'msg', 'frameOpen', 'msg', 'msg', 'frameElse', 'msg', 'frameClose',
      'frameOpen', 'msg', 'frameClose', 'msg',
    ]);
  });

  it('종류와 조건을 갈라 담는다', () => {
    const opens = m.steps.filter((s) => s.t === 'frameOpen') as Array<{ kind: string; label: string }>;
    expect(opens).toEqual([
      { t: 'frameOpen', kind: 'alt', label: '재고 있음' },
      { t: 'frameOpen', kind: 'loop', label: '3회' },
    ].map((x) => expect.objectContaining(x)) as never);
  });

  it('이름표를 종류와 조건으로 그린다', () => {
    expect(out).toContain('alt [재고 있음]');
    expect(out).toContain('loop [3회]');
    expect(out).toContain('[재고 없음]');
  });

  it('프레임이 viewBox 를 넘지 않는다', () => {
    const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(out)!.slice(1).map(Number) as number[];
    const over: string[] = [];
    for (const r of out.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const [x, y, w, h] = r.slice(1).map(Number) as number[];
      if (x! < vb[0]! - 0.5 || y! < vb[1]! - 0.5 || x! + w! > vb[0]! + vb[2]! + 0.5 || y! + h! > vb[1]! + vb[3]! + 0.5) {
        over.push(`(${x},${y})`);
      }
    }
    expect(over, `넘친 것: ${over.join(' ')}`).toEqual([]);
  });

  it('프레임 줄은 메시지 선을 만들지 않는다', () => {
    // 가로선은 메시지 6개 + else 구분선 1개다. 구분선은 `4 4` 점선이고
    // 점선 메시지는 `3 3` 이라 이 값으로 갈린다.
    const horizontal = out.split('\n').filter((l) => /<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="\1"/.test(l));
    const dividers = horizontal.filter((l) => l.includes('stroke-dasharray="4 4"'));
    expect(horizontal.length - dividers.length, `가로선 ${horizontal.length} · 구분선 ${dividers.length}`).toBe(6);
    expect(dividers.length).toBe(1);
  });

  it('중첩 프레임도 각각 테두리를 갖는다', () => {
    const n = ok(`sequenceDiagram
  loop 바깥
    opt 안쪽
      A->>B: x
    end
  end`);
    const o = drawSequence(n, defaultTheme(), 'd', 'x');
    expect(o).toContain('loop [바깥]');
    expect(o).toContain('opt [안쪽]');
  });

  it('짝이 안 맞으면 알린다', () => {
    expect(parseSequence('sequenceDiagram\n A->>B: x\n end')).toHaveProperty('error');
    expect(parseSequence('sequenceDiagram\n alt 조건\n A->>B: x')).toHaveProperty('error');
    expect(parseSequence('sequenceDiagram\n else 조건\n A->>B: x')).toHaveProperty('error');
  });

  it('안 닫힌 프레임도 그림을 포기하지 않는다', () => {
    // 파서는 거부하지만, 작도는 스팬이 안 닫혀도 마지막 행까지로 본다.
    const n = ok('sequenceDiagram\n alt 조건\n A->>B: x\n end');
    expect(() => drawSequence(n, defaultTheme(), 'd', 'x')).not.toThrow();
  });
});
