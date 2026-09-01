import { describe, it, expect } from 'vitest';
import { routeEdge } from '../src/layout/edge';

const box = (x: number, y: number) => ({ id: 'x', x, y, w: 100, h: 40 });

function pointInBox(p: { x: number; y: number }, b: ReturnType<typeof box>): boolean {
  return p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
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
  it('LR 역방향: 경로는 상자를 관통하지 않는다', () => {
    const from = box(200, 0);
    const to = box(0, 0);
    const { path } = routeEdge(from, to, 'LR');

    // 경로의 어떤 점도 상자 내부에 엄격히 있어서는 안 됨
    for (const p of path) {
      expect(pointInBox(p, from)).toBe(false);
      expect(pointInBox(p, to)).toBe(false);
    }
  });

  it('LR 역방향: 마지막 선분이 왼쪽을 가리킨다', () => {
    const from = box(200, 0);
    const to = box(0, 0);
    const { path } = routeEdge(from, to, 'LR');

    expect(path.length).toBeGreaterThan(2);
    const lastSegment = path[path.length - 1]!;
    const prevPoint = path[path.length - 2]!;
    // 마지막 선분은 왼쪽으로: x 좌표가 감소
    expect(lastSegment.x).toBeLessThan(prevPoint.x);
  });

  it('LR 역방향: 경로가 4점 이상이다', () => {
    const { path } = routeEdge(box(200, 0), box(0, 0), 'LR');
    expect(path.length).toBeGreaterThanOrEqual(4);
  });

  it('TD 역방향: 경로는 상자를 관통하지 않는다', () => {
    const from = box(0, 200);
    const to = box(0, 0);
    const { path } = routeEdge(from, to, 'TD');

    for (const p of path) {
      expect(pointInBox(p, from)).toBe(false);
      expect(pointInBox(p, to)).toBe(false);
    }
  });

  it('TD 역방향: 마지막 선분이 위쪽을 가리킨다', () => {
    const from = box(0, 200);
    const to = box(0, 0);
    const { path } = routeEdge(from, to, 'TD');

    expect(path.length).toBeGreaterThan(2);
    const lastSegment = path[path.length - 1]!;
    const prevPoint = path[path.length - 2]!;
    // 마지막 선분은 위쪽으로: y 좌표가 감소
    expect(lastSegment.y).toBeLessThan(prevPoint.y);
  });

  // ──── 영점 선분 제거 테스트 (Important 결함 게이트)
  it('영길이 선분을 제거한다', () => {
    const { path } = routeEdge(box(0, 0), box(100, 200), 'LR');

    // 연속된 동일 점이 없어야 함
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
});
