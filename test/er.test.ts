import { describe, it, expect } from 'vitest';
import { parseEr } from '../src/parse/er';
import { drawEr } from '../src/draw/er';
import { defaultTheme } from '../src/draw/theme';
import { renderDiagram } from '../src/render';

const ok = (src: string) => {
  const m = parseEr(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

const draw = (src: string) => drawEr(ok(src), defaultTheme(), 'd1', '설명');

function viewBoxOf(svg: string): { minX: number; minY: number; w: number; h: number } {
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!m) throw new Error('no viewBox');
  return { minX: Number(m[1]), minY: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

function allPoints(svg: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const m of svg.matchAll(/points="([^"]+)"/g)) {
    for (const pair of m[1]!.split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      pts.push({ x: x!, y: y! });
    }
  }
  // 관계 간선은 <path d="M … L … Q …">다 — 커맨드의 좌표쌍을 순서대로 뽑는다.
  for (const m of svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)) {
    const nums = (m[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
  }
  for (const m of svg.matchAll(/<line ([^/]+)\/>/g)) {
    const attrs = m[1]!;
    const x1 = Number(/x1="([-\d.]+)"/.exec(attrs)?.[1]);
    const y1 = Number(/y1="([-\d.]+)"/.exec(attrs)?.[1]);
    const x2 = Number(/x2="([-\d.]+)"/.exec(attrs)?.[1]);
    const y2 = Number(/y2="([-\d.]+)"/.exec(attrs)?.[1]);
    pts.push({ x: x1, y: y1 }, { x: x2, y: y2 });
  }
  for (const m of svg.matchAll(/<circle ([^/]+)\/>/g)) {
    const attrs = m[1]!;
    const cx = Number(/cx="([-\d.]+)"/.exec(attrs)?.[1]);
    const cy = Number(/cy="([-\d.]+)"/.exec(attrs)?.[1]);
    const r = Number(/r="([-\d.]+)"/.exec(attrs)?.[1]);
    pts.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r });
  }
  return pts;
}

describe('parseEr', () => {
  it('관계를 읽는다', () => {
    const m = ok('erDiagram\n ORDER ||--o{ ITEM : contains');
    expect(m.entities.map((e) => e.id)).toEqual(['ORDER', 'ITEM']);
    expect(m.rels[0]!.label).toBe('contains');
  });

  it('카디널리티 4종을 읽는다', () => {
    const m = ok('erDiagram\n A ||--o{ B : x\n C }o--|| D : y\n E |o--|{ F : z');
    expect(m.rels[0]!.fromCard).toBe('one');
    expect(m.rels[0]!.toCard).toBe('zeroMany');
    expect(m.rels[1]!.fromCard).toBe('zeroMany');
    expect(m.rels[1]!.toCard).toBe('one');
    expect(m.rels[2]!.fromCard).toBe('zeroOne');
    expect(m.rels[2]!.toCard).toBe('many');
  });

  it('라벨이 없어도 된다', () => {
    expect(ok('erDiagram\n A ||--o{ B : ""').rels[0]!.label).toBeUndefined();
  });

  it('닫히지 않은 속성 블록은 알린다', () => {
    expect(parseEr('erDiagram\n ORDER {\n string id')).toHaveProperty('error');
  });

  it('끝의 세미콜론을 벗긴다', () => {
    const m = ok('erDiagram\n A ||--o{ B : x;');
    expect(m.rels).toHaveLength(1);
  });

  it('한글 엔티티 id 도 읽는다', () => {
    const m = ok('erDiagram\n 주문 ||--o{ 항목 : 포함');
    expect(m.entities.map((e) => e.id)).toEqual(['주문', '항목']);
  });
});

describe('ER 렌더', () => {
  const r = renderDiagram('%% caption: 주문과 항목\nerDiagram\n ORDER ||--o{ ITEM : contains');

  it('그려진다', () => {
    expect(r.svg).toContain('<svg');
    expect(r.warnings).toHaveLength(0);
  });

  it('엔티티 이름이 들어간다', () => {
    expect(r.svg).toContain('>ORDER<');
    expect(r.svg).toContain('>ITEM<');
  });

  it('관계 라벨이 들어간다', () => {
    expect(r.svg).toContain('>contains<');
  });

  it('카디널리티 기호를 그린다', () => {
    expect((r.svg!.match(/<(line|polyline|circle)\b/g) ?? []).length).toBeGreaterThan(2);
  });

  it('빈 줄이 없고 한 줄에 요소 하나씩이다', () => {
    expect(r.svg!.split('\n').every((l) => l.trim().length > 0)).toBe(true);
  });

  it('금지 태그가 없다', () => {
    for (const t of ['<style', '<script', '<use', '<foreignObject']) expect(r.svg).not.toContain(t);
  });
});

describe('drawEr — bbox 는 텍스트와 순환 간선을 포함한다', () => {
  it('긴 관계 라벨이 bbox 를 늘린다', () => {
    const svg = draw('erDiagram\n A ||--o{ B : "이 관계는 아주 길게 설명하는 라벨이라 상자 사이 간격보다 훨씬 넓다"');
    const vb = viewBoxOf(svg);
    expect(vb.w).toBeGreaterThan(250);
  });

  it('순환 관계(뒤로 가는 간선)의 모든 점이 viewBox 안에 있다', () => {
    const svg = draw('erDiagram\n A ||--o{ B : x\n B ||--o{ A : y');
    const vb = viewBoxOf(svg);
    const pts = allPoints(svg);
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(vb.minX - 0.5);
      expect(p.x).toBeLessThanOrEqual(vb.minX + vb.w + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(vb.minY - 0.5);
      expect(p.y).toBeLessThanOrEqual(vb.minY + vb.h + 0.5);
    }
  });

  it('zeroMany 끝에는 "적어도 하나" 막대를 안 그린다 — 원+까마귀발만', () => {
    // ORDER 쪽(one)은 막대(line) 하나, ITEM 쪽(zeroMany)은 까마귀발(line 3개)+원(circle)
    // 만 나와야 한다. zeroMany 쪽에 막대까지 나오면 line 개수가 하나 더 많아진다.
    const svg = draw('erDiagram\n ORDER ||--o{ ITEM : contains');
    const lineCount = (svg.match(/<line\b/g) ?? []).length;
    expect(lineCount).toBe(1 /* one 쪽 막대 */ + 3 /* zeroMany 쪽 까마귀발 */);
    expect((svg.match(/<circle\b/g) ?? []).length).toBe(1);
  });

  it('zeroOne 끝에는 막대와 원이 함께 나오고 까마귀발은 없다', () => {
    const svg = draw('erDiagram\n A ||--o| B : x');
    const lineCount = (svg.match(/<line\b/g) ?? []).length;
    expect(lineCount).toBe(1 /* one 쪽 막대 */ + 1 /* zeroOne 쪽 막대 */);
    expect((svg.match(/<circle\b/g) ?? []).length).toBe(1);
  });

  it('네 카디널리티 모두 crow 기호 점이 viewBox 안에 있다', () => {
    const svg = draw('erDiagram\n A ||--o{ B : a\n C }o--|| D : b\n E |o--|{ F : c\n G }|--|| H : d');
    const vb = viewBoxOf(svg);
    const pts = allPoints(svg);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(vb.minX - 0.5);
      expect(p.x).toBeLessThanOrEqual(vb.minX + vb.w + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(vb.minY - 0.5);
      expect(p.y).toBeLessThanOrEqual(vb.minY + vb.h + 0.5);
    }
  });
});

describe('간선 라벨이 엔티티 이름을 덮지 않는다', () => {
  // 2026-09-01 실측: `owns` 칩이 `ORDER` 상자 한가운데에 놓여 엔티티 이름을
  // 통째로 가렸다. 라벨은 엔티티보다 나중에 그려서 위로 올라오기 때문에
  // 자리가 겹치면 엔티티 쪽이 진다.
  const src = `erDiagram
  MEMBER ||--o{ ORDER : places
  ORDER ||--o{ ORDER_ITEM : contains
  ORDER_ITEM }o--|| PRODUCT : refers
  ORDER ||--|| PAYMENT : settles
  PRODUCT }o--|| CATEGORY : belongs
  MEMBER ||--o{ ADDRESS : owns
  ORDER }o--|| ADDRESS : ships`;
  const m = parseEr(src);
  if ('error' in m) throw new Error(m.error);
  const out = drawEr(m, defaultTheme(), 'd', '설명');

  it('라벨 칩이 어느 엔티티 상자와도 겹치지 않는다', () => {
    const chips = [...out.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="3"/g)]
      .map((c) => ({ x: +c[1]!, y: +c[2]!, w: +c[3]!, h: +c[4]! }));
    const boxes = [...out.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="(?!3")/g)]
      .map((c) => ({ x: +c[1]!, y: +c[2]!, w: +c[3]!, h: +c[4]! }));
    expect(chips.length, '라벨 칩이 하나도 없다').toBeGreaterThan(0);
    expect(boxes.length, '엔티티 상자가 하나도 없다').toBeGreaterThan(0);
    const hits: string[] = [];
    for (const c of chips) {
      for (const b of boxes) {
        const ox = Math.min(c.x + c.w, b.x + b.w) - Math.max(c.x, b.x);
        const oy = Math.min(c.y + c.h, b.y + b.h) - Math.max(c.y, b.y);
        if (ox > 0 && oy > 0) hits.push(`칩(${c.x},${c.y}) × 상자(${b.x},${b.y}) ${ox.toFixed(1)}×${oy.toFixed(1)}px`);
      }
    }
    expect(hits, `엔티티를 덮은 라벨: ${hits.join(', ')}`).toEqual([]);
  });
});
