// ER 속성 블록 · 키 표기 · 식별/비식별 관계선.
import { describe, it, expect } from 'vitest';
import { parseEr } from '../src/parse/er';
import { drawEr } from '../src/draw/er';
import { defaultTheme } from '../src/draw/theme';

const ok = (src: string) => {
  const m = parseEr(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

const SRC = `erDiagram
  ORDER {
    bigint id PK
    bigint member_id FK
    string code UK "주문번호"
    datetime created_at
  }
  MEMBER {
    bigint id PK
  }
  MEMBER ||--o{ ORDER : places
  ORDER }o..|| ADDRESS : ships`;

describe('속성 블록', () => {
  const m = ok(SRC);
  const order = m.entities.find((e) => e.id === 'ORDER')!;

  it('타입과 이름을 갈라 담는다', () => {
    expect(order.attrs.map((a) => `${a.type} ${a.name}`)).toEqual(
      ['bigint id', 'bigint member_id', 'string code', 'datetime created_at'],
    );
  });

  it('키 표기를 읽는다', () => {
    expect(order.attrs.map((a) => a.keys.join(''))).toEqual(['PK', 'FK', 'UK', '']);
  });

  it('주석을 따옴표 없이 담는다', () => {
    expect(order.attrs[2]!.comment).toBe('주문번호');
  });

  it('관계에만 나온 엔티티도 만들어진다 — 속성 없이', () => {
    expect(m.entities.find((e) => e.id === 'ADDRESS')?.attrs).toEqual([]);
  });

  it('속성 있는 엔티티는 상자가 커진다', () => {
    const withAttrs = drawEr(m, defaultTheme(), 'd', 'x');
    const plain = drawEr(ok('erDiagram\n  MEMBER ||--o{ ORDER : places'), defaultTheme(), 'd', 'x');
    const h = (svg: string) => Number(/height="(\d+)"/.exec(svg)![1]);
    expect(h(withAttrs)).toBeGreaterThan(h(plain));
  });

  it('속성 줄을 실제로 그린다', () => {
    const out = drawEr(m, defaultTheme(), 'd', 'x');
    expect(out).toContain('bigint id');
    expect(out).toContain('PK');
    expect(out).toContain('datetime created_at');
  });

  it('키가 있는 줄은 없는 줄보다 진하게 그린다', () => {
    const out = drawEr(m, defaultTheme(), 'd', 'x');
    const pk = out.split('\n').find((l) => l.includes('bigint id'))!;
    const plain = out.split('\n').find((l) => l.includes('datetime created_at'))!;
    expect(pk).toContain('fill-opacity="1"');
    expect(plain).toMatch(/fill-opacity="0\.\d+"/);
  });
});

describe('식별 · 비식별 관계', () => {
  const m = ok(SRC);

  it('`--` 는 실선, `..` 는 점선이다', () => {
    expect(m.rels.map((r) => r.line)).toEqual(['solid', 'dotted']);
  });

  it('점선 관계만 stroke-dasharray 를 갖는다', () => {
    const out = drawEr(m, defaultTheme(), 'd', 'x');
    const paths = out.split('\n').filter((l) => l.startsWith('<path'));
    expect(paths.filter((l) => l.includes('stroke-dasharray')).length).toBe(1);
  });
});
