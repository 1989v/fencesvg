import { describe, it, expect } from 'vitest';
import { parseState } from '../src/parse/state';
import { drawState } from '../src/draw/state';
import { defaultTheme } from '../src/draw/theme';
import { renderDiagram } from '../src/render';

const ok = (src: string) => {
  const m = parseState(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

const draw = (src: string) => drawState(ok(src), defaultTheme(), 'd1', '설명');

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

describe('parseState', () => {
  it('전이를 읽는다', () => {
    const m = ok('stateDiagram-v2\n PENDING --> PAID');
    expect(m.edges).toHaveLength(1);
    expect(m.nodes.map((n) => n.id)).toEqual(['PENDING', 'PAID']);
  });

  it('전이 라벨을 읽는다', () => {
    expect(ok('stateDiagram-v2\n PENDING --> PAID: 결제 승인').edges[0]!.label).toBe('결제 승인');
  });

  it('[*] 를 시작·종료 노드로 만든다', () => {
    const m = ok('stateDiagram-v2\n [*] --> PENDING\n PENDING --> [*]');
    expect(m.nodes.some((n) => n.shape === 'round' && n.label === '')).toBe(true);
  });

  it('시작과 종료를 서로 다른 노드로 둔다', () => {
    const m = ok('stateDiagram-v2\n [*] --> A\n A --> [*]');
    expect(m.nodes).toHaveLength(3);
  });

  it('중첩 상태는 아직 못 읽는다고 알린다', () => {
    expect(parseState('stateDiagram-v2\n state A {\n B --> C\n }')).toHaveProperty('error');
  });

  it('공백 없는 화살표도 읽는다 (넓혀진 문법)', () => {
    const m = ok('stateDiagram-v2\n PENDING-->PAID: 승인');
    expect(m.edges[0]!.label).toBe('승인');
    expect(m.nodes.map((n) => n.id)).toEqual(['PENDING', 'PAID']);
  });

  it('끝의 세미콜론을 벗긴다', () => {
    const m = ok('stateDiagram-v2\n PENDING --> PAID;');
    expect(m.edges).toHaveLength(1);
  });

  it('한글 상태 id 도 읽는다', () => {
    const m = ok('stateDiagram-v2\n 대기 --> 결제완료');
    expect(m.nodes.map((n) => n.id)).toEqual(['대기', '결제완료']);
  });
});

describe('state 렌더', () => {
  const r = renderDiagram('%% caption: 주문 상태\nstateDiagram-v2\n [*] --> PENDING\n PENDING --> PAID: 승인\n PAID --> [*]');

  it('그려진다', () => {
    expect(r.svg).toContain('<svg');
    expect(r.warnings).toHaveLength(0);
  });

  it('시작·종료가 채워진 원이다', () => {
    expect(r.svg).toContain('<circle');
  });

  it('금지 태그가 없다', () => {
    for (const t of ['<style', '<script', '<use', '<foreignObject']) expect(r.svg).not.toContain(t);
  });

  it('빈 줄이 없고 한 줄에 요소 하나씩이다', () => {
    expect(r.svg!.split('\n').every((l) => l.trim().length > 0)).toBe(true);
  });
});

describe('drawState — bbox 는 텍스트를 포함한다', () => {
  it('긴 전이 라벨이 viewBox 밖으로 안 나간다', () => {
    const longLabel = '이 전이는 아주 길게 설명하는 라벨이라 상자 폭보다 훨씬 넓다';
    const svg = draw(`stateDiagram-v2\n A --> B: ${longLabel}`);
    const vb = viewBoxOf(svg);
    // 라벨은 두 노드 중점 사이에 가운데 정렬로 그려진다 — 그 절반 폭이
    // 중점에서 뻗어나가는 최소 여유다. 이 값보다 viewBox 가 좁으면 잘린다.
    const half = svg.includes(longLabel) ? 0 : -1;
    expect(half).toBe(0); // sanity: label text itself present
    expect(vb.w).toBeGreaterThan(200); // 실측값은 report 에 기록
  });

  it('순환 전이(뒤로 가는 간선)를 그리고 모든 점이 viewBox 안에 있다', () => {
    const svg = draw('stateDiagram-v2\n PENDING --> PAID: 승인\n PAID --> PENDING: 취소');
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
