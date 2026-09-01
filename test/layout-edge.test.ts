import { describe, it, expect } from 'vitest';
import { routeEdge } from '../src/layout/edge';

const box = (x: number, y: number) => ({ id: 'x', x, y, w: 100, h: 40 });

describe('routeEdge', () => {
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
});
