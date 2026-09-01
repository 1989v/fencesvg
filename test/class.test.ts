import { describe, it, expect } from 'vitest';
import { parseClass } from '../src/parse/class';
import { drawClass } from '../src/draw/class';
import { defaultTheme } from '../src/draw/theme';
import { renderDiagram } from '../src/render';

const ok = (src: string) => {
  const m = parseClass(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

const draw = (src: string) => drawClass(ok(src), defaultTheme(), 'd1', '설명');

function viewBoxOf(svg: string): { minX: number; minY: number; w: number; h: number } {
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!m) throw new Error('no viewBox');
  return { minX: Number(m[1]), minY: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

function pointsOf(svg: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const m of svg.matchAll(/points="([^"]+)"/g)) {
    for (const pair of m[1]!.split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      pts.push({ x: x!, y: y! });
    }
  }
  return pts;
}

function rectOf(svg: string, name: string): { x: number; y: number; w: number; h: number } {
  // <rect .../> 바로 다음 <text ...>name</text> 를 찾아 그 rect 를 반환한다
  const idx = svg.indexOf(`>${name}<`);
  if (idx < 0) throw new Error(`no box for ${name}`);
  const before = svg.slice(0, idx);
  const m = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g;
  let last: RegExpExecArray | null = null;
  let mm: RegExpExecArray | null;
  while ((mm = m.exec(before))) last = mm;
  if (!last) throw new Error(`no rect before ${name}`);
  return { x: Number(last[1]), y: Number(last[2]), w: Number(last[3]), h: Number(last[4]) };
}

describe('parseClass', () => {
  it('클래스와 멤버를 읽는다', () => {
    const m = ok('classDiagram\n class Order {\n +Long id\n +pay()\n }');
    expect(m.classes[0]!.id).toBe('Order');
    expect(m.classes[0]!.members).toEqual(['+Long id', '+pay()']);
  });

  it('관계 4종을 읽는다', () => {
    const m = ok([
      'classDiagram',
      'A <|-- B',
      'C <|.. D',
      'E --> F',
      'G ..> H',
    ].join('\n'));
    expect(m.rels.map((r) => r.rel)).toEqual(['inherit', 'implement', 'assoc', 'depend']);
  });

  it('관계 라벨을 읽는다', () => {
    expect(ok('classDiagram\n A --> B : uses').rels[0]!.label).toBe('uses');
  });

  it('관계에만 나온 클래스도 등록된다', () => {
    expect(ok('classDiagram\n A --> B').classes.map((c) => c.id)).toEqual(['A', 'B']);
  });

  it('네임스페이스는 아직 못 읽는다고 알린다', () => {
    expect(parseClass('classDiagram\n namespace n {\n class A\n }')).toHaveProperty('error');
  });

  it('상속 화살표는 from=자식, to=부모로 정규화한다', () => {
    const m = ok('classDiagram\n Animal <|-- Dog');
    expect(m.rels[0]).toMatchObject({ from: 'Dog', to: 'Animal', rel: 'inherit' });
  });

  it('공백 없는 화살표도 읽는다 (넓혀진 문법)', () => {
    const m = ok('classDiagram\n A<|--B');
    expect(m.rels[0]).toMatchObject({ from: 'B', to: 'A', rel: 'inherit' });
  });

  it('끝의 세미콜론을 벗긴다', () => {
    const m = ok('classDiagram\n A --> B;');
    expect(m.rels).toHaveLength(1);
  });

  it('한글 클래스 id 도 읽는다', () => {
    const m = ok('classDiagram\n class 주문 {\n +결제()\n }');
    expect(m.classes[0]!.id).toBe('주문');
  });
});

describe('class 렌더', () => {
  const r = renderDiagram('%% caption: 주문 모델\nclassDiagram\n class Order {\n +Long id\n +pay()\n }\n Order --> Payment : uses');

  it('그려진다', () => {
    expect(r.svg).toContain('<svg');
    expect(r.warnings).toHaveLength(0);
  });

  it('멤버가 들어간다', () => {
    expect(r.svg).toContain('>+Long id<');
    expect(r.svg).toContain('>+pay()<');
  });

  it('구획선을 그린다', () => {
    expect(r.svg).toContain('<line');
  });

  it('빈 줄이 없고 한 줄에 요소 하나씩이다', () => {
    expect(r.svg!.split('\n').every((l) => l.trim().length > 0)).toBe(true);
  });

  it('금지 태그가 없다', () => {
    for (const t of ['<style', '<script', '<use', '<foreignObject']) expect(r.svg).not.toContain(t);
  });
});

describe('drawClass — 상자 크기와 방향', () => {
  it('멤버가 많을수록 상자 높이가 커진다', () => {
    const small = draw('classDiagram\n class A {\n +x()\n }');
    const big = draw('classDiagram\n class B {\n +a()\n +b()\n +c()\n +d()\n +e()\n }');
    const ra = rectOf(small, 'A');
    const rb = rectOf(big, 'B');
    expect(rb.h).toBeGreaterThan(ra.h);
  });

  it('구획선은 클래스 이름 밑에 온다', () => {
    const svg = draw('classDiagram\n class A {\n +x()\n }');
    const r = rectOf(svg, 'A');
    const lineMatch = /<line x1="[-\d.]+" y1="([-\d.]+)"/.exec(svg);
    expect(lineMatch).not.toBeNull();
    const lineY = Number(lineMatch![1]);
    expect(lineY).toBeGreaterThan(r.y);
    expect(lineY).toBeLessThan(r.y + r.h);
  });

  it('상속 삼각형은 자식이 아니라 부모 쪽에 그려진다', () => {
    // A <|-- B: B 가 A 를 상속. 화살표 머리(삼각형)는 부모 A 를 가리켜야 한다.
    // marker-end 가 A 상자 쪽 끝에 있는지, 부모(A)가 자식(B)보다 위(작은 y)에
    // 배치됐는지로 검증한다.
    const svg = draw('classDiagram\n Animal <|-- Dog');
    const parent = rectOf(svg, 'Animal');
    const child = rectOf(svg, 'Dog');
    expect(parent.y).toBeLessThan(child.y); // 부모가 위에 온다(TD, 뒤집은 간선)

    const poly = /<polyline points="([^"]+)"[^/]*marker-end="url\(#d1-tri\)"/.exec(svg);
    expect(poly).not.toBeNull();
    const pts = poly![1]!.split(' ').map((p) => p.split(',').map(Number));
    const last = pts[pts.length - 1]!;
    // 화살표 끝점은 부모 상자의 아래쪽 변 근처(부모 쪽)에 있어야 한다 — 자식 쪽이 아니라.
    expect(last[1]).toBeGreaterThanOrEqual(parent.y);
    expect(last[1]).toBeLessThanOrEqual(parent.y + parent.h + 1);
  });

  it('상속·구현은 빈 삼각형, 연관·의존은 화살촉 marker 를 쓴다', () => {
    const svg = draw('classDiagram\n A <|-- B\n C --> D');
    expect(svg).toContain('id="d1-tri"');
    expect(svg).toContain('id="d1-arrow"');
  });

  it('구현·의존은 점선이다', () => {
    const svg = draw('classDiagram\n A <|.. B\n C ..> D');
    expect((svg.match(/stroke-dasharray/g) ?? []).length).toBe(2);
  });
});

describe('drawClass — bbox 는 텍스트와 순환 관계를 포함한다', () => {
  it('긴 관계 라벨이 bbox 를 늘린다', () => {
    const svg = draw('classDiagram\n A --> B : 이 관계는 아주 길게 설명하는 라벨이라 상자 사이 간격보다 훨씬 넓다');
    const vb = viewBoxOf(svg);
    expect(vb.w).toBeGreaterThan(200);
  });

  it('순환 의존 관계(뒤로 가는 간선)의 모든 점이 viewBox 안에 있다', () => {
    const svg = draw('classDiagram\n A --> B : x\n B --> A : y');
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('NaN');
    const vb = viewBoxOf(svg);
    const pts = pointsOf(svg);
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(vb.minX - 0.5);
      expect(p.x).toBeLessThanOrEqual(vb.minX + vb.w + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(vb.minY - 0.5);
      expect(p.y).toBeLessThanOrEqual(vb.minY + vb.h + 0.5);
    }
  });
});
