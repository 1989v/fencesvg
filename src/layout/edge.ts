import type { Placed, Dir } from './graph';

export type Point = { x: number; y: number };

/** 중심 계산 */
function center(b: Placed): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** 랭크축에서 전진 방향 */
function rankAxisDelta(from: Placed, to: Placed, dir: Dir): number {
  const fromCenter = center(from);
  const toCenter = center(to);
  switch (dir) {
    case 'LR': return toCenter.x - fromCenter.x;
    case 'RL': return fromCenter.x - toCenter.x;
    case 'TD': return toCenter.y - fromCenter.y;
    case 'BT': return fromCenter.y - toCenter.y;
  }
}

/** 역방향 간선 판정 */
function isBackEdge(from: Placed, to: Placed, dir: Dir): boolean {
  // <= 0: when rank-axis centres tie, normal ports face the wrong way
  // and a direct line crosses the target box interior. Detour is correct.
  return rankAxisDelta(from, to, dir) <= 0;
}

/**
 * LR/RL/TD/BT 방향에 따라 정규 경로를 구성한다.
 * aligned 시 2점, 아니면 4점 S-curve.
 */
function routeForward(from: Placed, to: Placed, dir: Dir, aligned: boolean, entryOffset = 0): Point[] {
  const fromC = center(from);
  const toC = center(to);
  const a = dir === 'LR' ? { x: from.x + from.w, y: fromC.y } :
            dir === 'RL' ? { x: from.x, y: fromC.y } :
            dir === 'TD' ? { x: fromC.x, y: from.y + from.h } :
            /* BT */ { x: fromC.x, y: from.y };

  // 여러 간선이 한 노드로 들어오면 진입점이 정확히 겹쳐 화살촉이 포개진다 —
  // 실측에서 클래스도의 연관(`uses`)이 상속 삼각형과 같은 점에 꽂혀 연관이
  // 상속처럼 보였다. 교차축으로 조금씩 벌려 화살촉을 분리한다.
  const b = dir === 'LR' ? { x: to.x, y: toC.y + entryOffset } :
            dir === 'RL' ? { x: to.x + to.w, y: toC.y + entryOffset } :
            dir === 'TD' ? { x: toC.x + entryOffset, y: to.y } :
            /* BT */ { x: toC.x + entryOffset, y: to.y + to.h };

  if (aligned) {
    return [a, b];
  }

  if (dir === 'LR' || dir === 'RL') {
    return [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b];
  } else {
    return [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b];
  }
}

/**
 * 역방향 간선을 상자 주위로 우회시킨다.
 * 라벨은 차단 차선의 중점에 배치한다.
 */
function routeBackEdge(from: Placed, to: Placed, dir: Dir): { path: Point[]; labelAt: Point } {
  const fromC = center(from);
  const toC = center(to);

  if (dir === 'LR') {
    const lane = Math.min(from.y, to.y) - 16;
    const fromLeft = from.x;
    const toRight = to.x + to.w;
    const stub = toRight + 12;
    const path = [
      { x: fromLeft, y: fromC.y },
      { x: fromLeft, y: lane },
      { x: stub, y: lane },
      { x: stub, y: toC.y },
      { x: toRight, y: toC.y },
    ];
    return { path, labelAt: { x: (fromLeft + stub) / 2, y: lane } };
  } else if (dir === 'RL') {
    const lane = Math.min(from.y, to.y) - 16;
    const fromRight = from.x + from.w;
    const toLeft = to.x;
    const stub = toLeft - 12;
    const path = [
      { x: fromRight, y: fromC.y },
      { x: fromRight, y: lane },
      { x: stub, y: lane },
      { x: stub, y: toC.y },
      { x: toLeft, y: toC.y },
    ];
    return { path, labelAt: { x: (fromRight + stub) / 2, y: lane } };
  } else if (dir === 'TD') {
    const lane = Math.min(from.x, to.x) - 16;
    const fromTop = from.y;
    const toBottom = to.y + to.h;
    const stub = toBottom + 12;
    const path = [
      { x: fromC.x, y: fromTop },
      { x: lane, y: fromTop },
      { x: lane, y: stub },
      { x: toC.x, y: stub },
      { x: toC.x, y: toBottom },
    ];
    return { path, labelAt: { x: lane, y: (fromTop + stub) / 2 } };
  } else {
    // BT
    const lane = Math.min(from.x, to.x) - 16;
    const fromBottom = from.y + from.h;
    const toTop = to.y;
    const stub = toTop - 12;
    const path = [
      { x: fromC.x, y: fromBottom },
      { x: lane, y: fromBottom },
      { x: lane, y: stub },
      { x: toC.x, y: stub },
      { x: toC.x, y: toTop },
    ];
    return { path, labelAt: { x: lane, y: (fromBottom + stub) / 2 } };
  }
}

/** 연속된 동일 점 제거 (epsilon = 0.01) */
function dedupPoints(points: Point[]): Point[] {
  if (points.length <= 1) return points;
  const result: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1]!;
    const curr = points[i]!;
    if (Math.abs(curr.x - prev.x) > 0.01 || Math.abs(curr.y - prev.y) > 0.01) {
      result.push(curr);
    }
  }
  return result;
}

/**
 * 직교 꺾은선. 랭크축으로 절반 나아가고, 교차축을 맞춘 뒤, 다시 랭크축으로 들어간다.
 * 역방향 간선은 상자를 우회한다.
 */
/**
 * 한 노드로 들어오는 간선이 여럿일 때 이 간선이 쓸 진입점 오프셋.
 * `slot` 은 0부터, `count` 는 그 노드로 들어오는 간선 수다. 상자 밖으로
 * 나가지 않도록 폭(또는 높이)의 절반에서 여유를 뺀 만큼으로 자른다.
 */
export function entryOffsetFor(to: Placed, dir: Dir, slot: number, count: number): number {
  if (count <= 1) return 0;
  const span = dir === 'LR' || dir === 'RL' ? to.h : to.w;
  const limit = Math.max(0, span / 2 - 10);
  const spacing = Math.min(20, (2 * limit) / (count - 1));
  return (slot - (count - 1) / 2) * spacing;
}

export function routeEdge(
  from: Placed,
  to: Placed,
  dir: Dir,
  entryOffset = 0,
): { path: Point[]; labelAt: Point } {
  const fromC = center(from);
  const toC = center(to);
  const horizontal = dir === 'LR' || dir === 'RL';
  const aligned = horizontal ? Math.abs(fromC.y - toC.y) < 0.5 : Math.abs(fromC.x - toC.x) < 0.5;

  let result: { path: Point[]; labelAt: Point };
  if (isBackEdge(from, to, dir)) {
    result = routeBackEdge(from, to, dir);
  } else {
    const path = routeForward(from, to, dir, aligned && entryOffset === 0, entryOffset);
    result = { path, labelAt: { x: (fromC.x + toC.x) / 2, y: (fromC.y + toC.y) / 2 } };
  }

  result.path = dedupPoints(result.path);

  // Collapse to one point: fall back to back-edge to ensure renderable path
  if (result.path.length < 2) {
    result = routeBackEdge(from, to, dir);
  }

  return result;
}
