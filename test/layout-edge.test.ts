import { describe, it, expect } from 'vitest';
import { routeEdge } from '../src/layout/edge';

// id 는 상자마다 다르게 준다 — 같은 id 를 재사용하면 자기 루프 판정에 걸린다.
let seq = 0;
const box = (x: number, y: number) => ({ id: `n${++seq}`, x, y, w: 100, h: 40 });

type Box = ReturnType<typeof box>;

/**
 * 축정렬 선분이 상자 내부를 관통하는가?
 * 수평 선분: y가 (box.y, box.y+box.h) 범위에 있고 x-범위가 겹쳐야 함
 * 수직 선분: x가 (box.x, box.x+box.w) 범위에 있고 y-범위가 겹쳐야 함
 */
function segmentCrossesBoxInterior(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  b: Box
): boolean {
  const isHorizontal = Math.abs(p1.y - p2.y) < 0.01;
  const isVertical = Math.abs(p1.x - p2.x) < 0.01;

  if (isHorizontal) {
    const y = p1.y;
    const xMin = Math.min(p1.x, p2.x);
    const xMax = Math.max(p1.x, p2.x);
    // 수평선이 상자의 y 범위에 있는가? (내부만)
    if (y > b.y && y < b.y + b.h) {
      // 선분의 x-범위가 상자 내부와 겹치는가?
      return !(xMax <= b.x || xMin >= b.x + b.w);
    }
  } else if (isVertical) {
    const x = p1.x;
    const yMin = Math.min(p1.y, p2.y);
    const yMax = Math.max(p1.y, p2.y);
    // 수직선이 상자의 x 범위에 있는가? (내부만)
    if (x > b.x && x < b.x + b.w) {
      // 선분의 y-범위가 상자 내부와 겹치는가?
      return !(yMax <= b.y || yMin >= b.y + b.h);
    }
  }

  return false;
}

describe('routeEdge', () => {
  // ──── 기존 전진 간선 테스트 (변경 없음)
  it('LR 에서 오른쪽 테두리에서 나가 왼쪽 테두리로 들어간다', () => {
    const { path } = routeEdge(box(0, 0), box(200, 0), 'LR');
    expect(path[0]).toEqual({ x: 100, y: 20 });
    expect(path[path.length - 1]).toEqual({ x: 200, y: 20 });
  });

  it('TD 에서 아래 테두리에서 나가 위 테두리로 들어간다', () => {
    const { path } = routeEdge(box(0, 0), box(0, 200), 'TD');
    expect(path[0]).toEqual({ x: 50, y: 40 });
    expect(path[path.length - 1]).toEqual({ x: 50, y: 200 });
  });

  it('교차축이 어긋나면 꺾는다', () => {
    const { path } = routeEdge(box(0, 0), box(200, 120), 'LR');
    expect(path.length).toBeGreaterThan(2);
  });

  it('일직선이면 두 점이다', () => {
    const { path } = routeEdge(box(0, 0), box(200, 0), 'LR');
    expect(path).toHaveLength(2);
  });

  it('라벨 위치는 경로 중간이다', () => {
    const { labelAt } = routeEdge(box(0, 0), box(200, 0), 'LR');
    expect(labelAt.x).toBeCloseTo(150, 0);
  });

  // ──── 역방향 간선 테스트 (CRITICAL 결함 게이트)
  it('LR 역방향: 경로 선분이 상자 내부를 관통하지 않는다', () => {
    const from = box(200, 0);
    const to = box(0, 0);
    const { path } = routeEdge(from, to, 'LR');

    // 각 선분이 두 상자를 관통하는지 확인
    for (let i = 1; i < path.length; i++) {
      const p1 = path[i - 1]!;
      const p2 = path[i]!;
      expect(segmentCrossesBoxInterior(p1, p2, from)).toBe(false);
      expect(segmentCrossesBoxInterior(p1, p2, to)).toBe(false);
    }
  });

  it('LR 역방향: 마지막 선분이 왼쪽을 가리킨다', () => {
    const from = box(200, 0);
    const to = box(0, 0);
    const { path } = routeEdge(from, to, 'LR');

    const lastSegment = path[path.length - 1]!;
    const prevPoint = path[path.length - 2]!;
    expect(lastSegment.x).toBeLessThan(prevPoint.x);
  });

  it('TD 역방향: 경로 선분이 상자 내부를 관통하지 않는다', () => {
    const from = box(0, 200);
    const to = box(0, 0);
    const { path } = routeEdge(from, to, 'TD');

    for (let i = 1; i < path.length; i++) {
      const p1 = path[i - 1]!;
      const p2 = path[i]!;
      expect(segmentCrossesBoxInterior(p1, p2, from)).toBe(false);
      expect(segmentCrossesBoxInterior(p1, p2, to)).toBe(false);
    }
  });

  it('TD 역방향: 마지막 선분이 위쪽을 가리킨다', () => {
    const from = box(0, 200);
    const to = box(0, 0);
    const { path } = routeEdge(from, to, 'TD');

    const lastSegment = path[path.length - 1]!;
    const prevPoint = path[path.length - 2]!;
    expect(lastSegment.y).toBeLessThan(prevPoint.y);
  });

  it('RL 역방향: 경로 선분이 상자 내부를 관통하지 않는다', () => {
    const from = box(0, 0);
    const to = box(200, 0);
    const { path } = routeEdge(from, to, 'RL');

    for (let i = 1; i < path.length; i++) {
      const p1 = path[i - 1]!;
      const p2 = path[i]!;
      expect(segmentCrossesBoxInterior(p1, p2, from)).toBe(false);
      expect(segmentCrossesBoxInterior(p1, p2, to)).toBe(false);
    }
  });

  it('RL 역방향: 마지막 선분이 오른쪽을 가리킨다', () => {
    const from = box(0, 0);
    const to = box(200, 0);
    const { path } = routeEdge(from, to, 'RL');

    const lastSegment = path[path.length - 1]!;
    const prevPoint = path[path.length - 2]!;
    expect(lastSegment.x).toBeGreaterThan(prevPoint.x);
  });

  it('BT 역방향: 경로 선분이 상자 내부를 관통하지 않는다', () => {
    const from = box(0, 0);
    const to = box(0, 200);
    const { path } = routeEdge(from, to, 'BT');

    for (let i = 1; i < path.length; i++) {
      const p1 = path[i - 1]!;
      const p2 = path[i]!;
      expect(segmentCrossesBoxInterior(p1, p2, from)).toBe(false);
      expect(segmentCrossesBoxInterior(p1, p2, to)).toBe(false);
    }
  });

  it('BT 역방향: 마지막 선분이 아래쪽을 가리킨다', () => {
    const from = box(0, 0);
    const to = box(0, 200);
    const { path } = routeEdge(from, to, 'BT');

    const lastSegment = path[path.length - 1]!;
    const prevPoint = path[path.length - 2]!;
    expect(lastSegment.y).toBeGreaterThan(prevPoint.y);
  });

  // ──── 영점 선분 제거 테스트 (Important 결함 게이트)
  it('영길이 선분을 제거한다', () => {
    const { path } = routeEdge(box(0, 0), box(100, 200), 'LR');

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1]!;
      const curr = path[i]!;
      const distance = Math.sqrt(
        (curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2
      );
      expect(distance).toBeGreaterThan(0.01);
    }
  });

  it('영길이 선분 제거 후 마지막 선분의 길이가 0이 아니다', () => {
    const { path } = routeEdge(box(0, 0), box(100, 200), 'LR');

    expect(path.length).toBeGreaterThanOrEqual(2);
    const lastSegment = path[path.length - 1]!;
    const prevPoint = path[path.length - 2]!;
    const distance = Math.sqrt(
      (lastSegment.x - prevPoint.x) ** 2 + (lastSegment.y - prevPoint.y) ** 2
    );
    expect(distance).toBeGreaterThan(0);
  });

  // ──── 중점 중복 제거 후 경로 붕괴 테스트
  it('중복 후 1점으로 붕괴하면 우회 경로로 폴백한다', () => {
    const { path } = routeEdge(box(0, 0), box(100, 0), 'LR');

    // 적어도 2점 이상
    expect(path.length).toBeGreaterThanOrEqual(2);
    // 마지막 선분이 0이 아님
    const lastSegment = path[path.length - 1]!;
    const prevPoint = path[path.length - 2]!;
    const distance = Math.sqrt(
      (lastSegment.x - prevPoint.x) ** 2 + (lastSegment.y - prevPoint.y) ** 2
    );
    expect(distance).toBeGreaterThan(0);
  });
});
