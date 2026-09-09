import { describe, it, expect } from 'vitest';
import { blockedLength, planPorts, routeEdge, type Point } from '../src/layout/edge';
import type { Placed } from '../src/layout/graph';

const box = (id: string, x: number, y: number, w = 100, h = 40): Placed => ({ id, x, y, w, h });

const isOrthogonal = (path: Point[]) => path.every((p, i) => i === 0 || Math.abs(p.x - path[i - 1]!.x) < 1e-6 || Math.abs(p.y - path[i - 1]!.y) < 1e-6);

/** 축정렬 선분 두 개가 서로 가로지르는가 (끝점이 맞닿는 것은 제외). */
function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const aH = Math.abs(a1.y - a2.y) < 1e-6, bH = Math.abs(b1.y - b2.y) < 1e-6;
  if (aH === bH) return false;
  const [h1, h2, v1, v2] = aH ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
  const y = h1!.y, x = v1!.x;
  return x > Math.min(h1!.x, h2!.x) && x < Math.max(h1!.x, h2!.x) && y > Math.min(v1!.y, v2!.y) && y < Math.max(v1!.y, v2!.y);
}
function pathsCross(p: Point[], q: Point[]): boolean {
  for (let i = 0; i + 1 < p.length; i++) for (let j = 0; j + 1 < q.length; j++) if (segmentsCross(p[i]!, p[i + 1]!, q[j]!, q[j + 1]!)) return true;
  return false;
}

describe('routeEdge — 같은 줄의 중간 노드를 피해 간다', () => {
  it('LR: 한 줄 건너뛰는 간선이 사이 노드를 관통하지 않는다 (피하지 않으면 관통한다)', () => {
    const A = box('A', 0, 0), B = box('B', 176, 0), C = box('C', 352, 0);
    const naive = routeEdge(A, C, 'LR').path;
    expect(blockedLength(naive, [B]), '피하지 않는 경로는 B 를 관통해야 이 검사가 의미 있다').toBeGreaterThan(0);
    const path = routeEdge(A, C, 'LR', 0, { obstacles: [A, B, C] }).path;
    expect(blockedLength(path, [B])).toBe(0);
    expect(isOrthogonal(path)).toBe(true);
    expect(path[0]).toEqual({ x: 100, y: 20 });
    expect(path[path.length - 1]).toEqual({ x: 352, y: 20 });
  });

  it('TD: 같은 열의 아래 노드를 건너뛰는 간선이 그 노드를 관통하지 않는다', () => {
    const A = box('A', 0, 0), B = box('B', 0, 96), C = box('C', 0, 192);
    const naive = routeEdge(A, C, 'TD').path;
    expect(blockedLength(naive, [B])).toBeGreaterThan(0);
    const path = routeEdge(A, C, 'TD', 0, { obstacles: [A, B, C] }).path;
    expect(blockedLength(path, [B])).toBe(0);
    expect(isOrthogonal(path)).toBe(true);
  });

  it('장애물이 없으면 기존 경로 그대로다', () => {
    const A = box('A', 0, 0), C = box('C', 200, 80);
    expect(routeEdge(A, C, 'LR', 0, { obstacles: [A, C] }).path).toEqual(routeEdge(A, C, 'LR').path);
  });
});

describe('planPorts — 부채꼴은 벌려 나가고 서로 겹치지도 가로지르지도 않는다', () => {
  const C = box('C', 300, 0);
  const D = [box('D1', 0, 120), box('D2', 200, 120), box('D3', 400, 120), box('D4', 600, 120)];
  const at = new Map<string, Placed>([C, ...D].map((n) => [n.id, n]));
  const edges = D.map((d) => ({ from: 'C', to: d.id }));
  const ports = planPorts(edges, at, 'TD');
  const paths = edges.map((e, i) => {
    const { entryOffset, ...port } = ports[i]!;
    return routeEdge(at.get(e.from)!, at.get(e.to)!, 'TD', entryOffset, { ...port, obstacles: [...at.values()] }).path;
  });

  it('출구 x 가 전부 다르다', () => {
    expect(new Set(paths.map((p) => p[0]!.x)).size).toBe(4);
  });

  it('가로 구간의 y 가 전부 다르다 — 같은 가로줄을 나눠 타지 않는다', () => {
    const ys = paths.map((p) => p.find((pt, i) => i > 0 && Math.abs(pt.y - p[i - 1]!.y) < 1e-6)!.y);
    expect(new Set(ys.map((y) => Math.round(y * 100) / 100)).size).toBe(4);
  });

  it('네 경로가 서로 가로지르지 않는다', () => {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(pathsCross(paths[i]!, paths[j]!), `${i}×${j}`).toBe(false);
  });

  it('들어오는 부채꼴(팬인)도 같다', () => {
    const L = box('L', 300, 240);
    const at2 = new Map<string, Placed>([L, ...D].map((n) => [n.id, n]));
    const edges2 = D.map((d) => ({ from: d.id, to: 'L' }));
    const ports2 = planPorts(edges2, at2, 'TD');
    const paths2 = edges2.map((e, i) => {
      const { entryOffset, ...port } = ports2[i]!;
      return routeEdge(at2.get(e.from)!, at2.get(e.to)!, 'TD', entryOffset, { ...port, obstacles: [...at2.values()] }).path;
    });
    expect(new Set(paths2.map((p) => p[p.length - 1]!.x)).size).toBe(4);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(pathsCross(paths2[i]!, paths2[j]!), `${i}×${j}`).toBe(false);
  });
});
