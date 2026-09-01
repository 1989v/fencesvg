// 클래스도의 UML 관계 12종 · 제네릭 · 표식 · 개수 표기.
import { describe, it, expect } from 'vitest';
import { parseClass } from '../src/parse/class';
import { drawClass } from '../src/draw/class';
import { defaultTheme } from '../src/draw/theme';

const ok = (src: string) => {
  const m = parseClass(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

describe('관계 12종', () => {
  const m = ok(`classDiagram
  Payment <|-- CardPayment
  CardPayment2 --|> Payment
  Payment <|.. Impl
  Impl2 ..|> Payment
  Order *-- OrderItem
  OrderItem2 --* Order
  Cart o-- Item
  Item2 --o Cart
  A --> B
  C <-- D
  E ..> F
  G <.. H
  I -- J
  K .. L`);

  it('연결자마다 관계 종류를 읽는다', () => {
    expect(m.rels.map((r) => r.rel)).toEqual([
      'inherit', 'inherit', 'implement', 'implement',
      'compose', 'compose', 'aggregate', 'aggregate',
      'assoc', 'assoc', 'depend', 'depend', 'link', 'link',
    ]);
  });

  it('왼쪽을 가리키는 연결자는 방향을 뒤집는다 — 머리가 부모에 간다', () => {
    // `Payment <|-- CardPayment` 와 `CardPayment2 --|> Payment` 는 둘 다 부모가 Payment 다.
    expect(m.rels[0]).toMatchObject({ from: 'CardPayment', to: 'Payment' });
    expect(m.rels[1]).toMatchObject({ from: 'CardPayment2', to: 'Payment' });
    expect(m.rels[4]).toMatchObject({ from: 'OrderItem', to: 'Order' });
    expect(m.rels[5]).toMatchObject({ from: 'OrderItem2', to: 'Order' });
  });

  it('합성과 집합은 서로 다른 마름모를 쓴다', () => {
    const out = drawClass(m, defaultTheme(), 'd', 'x');
    const ids = [...out.matchAll(/<marker id="([^"]+)"/g)].map((x) => x[1]!);
    expect(ids).toContain('d-compose');
    expect(ids).toContain('d-aggregate');
  });

  it('화살촉 없는 연결(`--`·`..`)에는 marker-end 를 안 붙인다', () => {
    const out = drawClass(ok('classDiagram\n  A -- B'), defaultTheme(), 'd', 'x');
    expect(out).not.toMatch(/marker-end/);
  });
});

describe('제네릭 · 표식 · 개수 표기', () => {
  const m = ok(`classDiagram
  class Repo~Order~ {
    <<interface>>
    +find(id)
  }
  class Order
  Order : <<entity>>
  Order "1" --> "0..*" Item : contains`);

  it('제네릭을 이름에서 갈라 담는다', () => {
    expect(m.classes.find((c) => c.id === 'Repo')?.generic).toBe('Order');
  });

  it('제네릭 표기를 `<>` 로 펴서 그린다', () => {
    expect(drawClass(m, defaultTheme(), 'd', 'x')).toContain('Repo&lt;Order&gt;');
  });

  it('표식은 멤버가 아니라 클래스에 붙는다', () => {
    const repo = m.classes.find((c) => c.id === 'Repo')!;
    expect(repo.stereotype).toBe('interface');
    expect(repo.members).toEqual(['+find(id)']);
  });

  it('블록 없이 붙인 표식도 읽는다', () => {
    expect(m.classes.find((c) => c.id === 'Order')?.stereotype).toBe('entity');
  });

  it('표식을 이름 위에 «» 로 그린다', () => {
    expect(drawClass(m, defaultTheme(), 'd', 'x')).toContain('«interface»');
  });

  it('개수 표기를 양 끝에 담고 그린다', () => {
    const rel = m.rels.find((r) => r.label === 'contains')!;
    expect([rel.fromCard, rel.toCard]).toEqual(['1', '0..*']);
    const out = drawClass(m, defaultTheme(), 'd', 'x');
    expect(out).toContain('>1<');
    expect(out).toContain('>0..*<');
  });
});
