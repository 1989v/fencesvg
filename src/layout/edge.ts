import type { Placed, Dir } from './graph';

export type Point = { x: number; y: number };

/** 상자의 랭크축 방향 출구·입구 지점 */
function port(b: Placed, side: 'out' | 'in', dir: Dir): Point {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  switch (dir) {
    case 'LR': return { x: side === 'out' ? b.x + b.w : b.x, y: cy };
    case 'RL': return { x: side === 'out' ? b.x : b.x + b.w, y: cy };
    case 'TD': return { x: cx, y: side === 'out' ? b.y + b.h : b.y };
    case 'BT': return { x: cx, y: side === 'out' ? b.y : b.y + b.h };
  }
}

/**
 * 직교 꺾은선. 랭크축으로 절반 나아가고, 교차축을 맞춘 뒤, 다시 랭크축으로 들어간다.
 * 곡선을 쓰지 않는 이유 — path 데이터가 길어지면 손으로 읽을 수 없고,
 * 스펙이 말하는 "긴 장식용 path 는 도구가 필요하다는 신호"에 걸린다.
 */
export function routeEdge(from: Placed, to: Placed, dir: Dir): { path: Point[]; labelAt: Point } {
  const a = port(from, 'out', dir);
  const b = port(to, 'in', dir);
  const horizontal = dir === 'LR' || dir === 'RL';
  const aligned = horizontal ? Math.abs(a.y - b.y) < 0.5 : Math.abs(a.x - b.x) < 0.5;

  const path: Point[] = aligned
    ? [a, b]
    : horizontal
      ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]
      : [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b];

  return { path, labelAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}
