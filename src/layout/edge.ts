import type { Placed, Dir } from './graph';

export type Point = { x: number; y: number };

/** 이만큼 이하로 어긋난 간선은 도착 직전에서 꺾는다(모여드는 모양). */
const FAN_DRIFT = 28;
/** 도착 직전에서 꺾을 때 노드에서 떨어뜨릴 거리. */
const FAN_LEAD = 16;

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

/** 축정렬 상자. `Placed` 와 같은 모양이지만 id 가 없어도 된다. */
export type Obstacle = { x: number; y: number; w: number; h: number; id?: string };

/** 선분 p→q 가 상자 안에 있는 매개변수 구간 [t0, t1] (Liang–Barsky). 안 만나면 null. */
export function segmentInsideSpan(
  p: Point, q: Point, b: { minX: number; maxX: number; minY: number; maxY: number },
): [number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  const checks: [number, number][] = [[-dx, p.x - b.minX], [dx, b.maxX - p.x], [-dy, p.y - b.minY], [dy, b.maxY - p.y]];
  for (const [pk, qk] of checks) {
    if (pk === 0) { if (qk < 0) return null; continue; }
    const r = qk / pk;
    if (pk < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** 경로가 상자들 안쪽을 지나는 길이의 합. 여유 `margin` 만큼 부풀린 상자로 잰다 —
 * 모서리를 스치는 선도 관통으로 본다. */
export function blockedLength(path: Point[], boxes: Obstacle[], margin = 2): number {
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i]!, q = path[i + 1]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len === 0) continue;
    for (const b of boxes) {
      const span = segmentInsideSpan(p, q, { minX: b.x - margin, maxX: b.x + b.w + margin, minY: b.y - margin, maxY: b.y + b.h + margin });
      if (span) total += (span[1] - span[0]) * len;
    }
  }
  return total;
}

function sameBox(a: Obstacle, b: Placed): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * `lo`~`hi` 사이에서 상자들이 비워 둔 차선(구간의 중점)들. `axis` 축의 구간을
 * 본다. 상자 사이의 틈마다 하나, 양 끝(lo 와 첫 상자, 마지막 상자와 hi)에 하나씩.
 */
function laneCandidates(boxes: Obstacle[], lo: number, hi: number, axis: 'x' | 'y'): number[] {
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  const spans = boxes
    .map((o) => axis === 'x' ? [o.x, o.x + o.w] : [o.y, o.y + o.h])
    .filter(([s, e]) => e! > a && s! < b)
    .sort((p, q) => p[0]! - q[0]!);
  const lanes: number[] = [];
  let cursor = a;
  for (const [s, e] of spans) {
    if (s! > cursor) lanes.push((cursor + s!) / 2);
    cursor = Math.max(cursor, e!);
  }
  if (cursor < b) lanes.push((cursor + b) / 2);
  return lanes;
}

export type ForwardOpts = {
  entryOffset?: number;
  exitOffset?: number;
  /** 꺾는 지점(랭크축 좌표)을 직접 지정한다 — 부채꼴(`planPorts`)이 정한다. */
  knee?: number;
  /** 피해 갈 상자들. 출발·도착 상자는 걸러 낸다. */
  obstacles?: Obstacle[];
};

/**
 * LR/RL/TD/BT 방향에 따라 정규 경로를 구성한다. aligned 시 2점, 아니면 4점 S-curve.
 *
 * 직교 경로는 **같은 랭크의 중간 노드를 그냥 가로지른다** — 출발 노드의 높이로
 * 가로선을 긋다가 그 줄에 있는 다른 상자를 관통했다(실측: 간선 둘이 이웃 노드를
 * 120px 씩 뚫고 지나갔다). 그래서 꺾는 지점을 후보 몇 개 중에서 고른다 — 기본
 * 지점이 비어 있으면 그대로(기존 출력과 같다), 막혀 있으면 상자들 사이의 빈
 * 차선으로 옮기고, 그래도 안 되면 교차축의 빈 차선으로 돌아가는 6점 경로를 쓴다.
 */
function routeForward(from: Placed, to: Placed, dir: Dir, aligned: boolean, o: ForwardOpts = {}): Point[] {
  const fromC = center(from);
  const toC = center(to);
  const exitOffset = o.exitOffset ?? 0;
  const entryOffset = o.entryOffset ?? 0;
  const a = dir === 'LR' ? { x: from.x + from.w, y: fromC.y + exitOffset } :
            dir === 'RL' ? { x: from.x, y: fromC.y + exitOffset } :
            dir === 'TD' ? { x: fromC.x + exitOffset, y: from.y + from.h } :
            /* BT */ { x: fromC.x + exitOffset, y: from.y };

  // 여러 간선이 한 노드로 들어오면 진입점이 정확히 겹쳐 화살촉이 포개진다 —
  // 실측에서 클래스도의 연관(`uses`)이 상속 삼각형과 같은 점에 꽂혀 연관이
  // 상속처럼 보였다. 교차축으로 조금씩 벌려 화살촉을 분리한다.
  const b = dir === 'LR' ? { x: to.x, y: toC.y + entryOffset } :
            dir === 'RL' ? { x: to.x + to.w, y: toC.y + entryOffset } :
            dir === 'TD' ? { x: toC.x + entryOffset, y: to.y } :
            /* BT */ { x: toC.x + entryOffset, y: to.y + to.h };

  const others = (o.obstacles ?? []).filter((n) => !sameBox(n, from) && !sameBox(n, to));
  const cost = (path: Point[]) => (others.length ? blockedLength(path, others) : 0);

  if (aligned) {
    const straight = [a, b];
    if (cost(straight) === 0) return straight;
  }

  // 꺾는 지점을 고른다.
  //
  // 늘 한가운데서 꺾으면 진입점을 몇 px 만 벌린 간선이 허공에서 살짝
  // 지그재그하며 선이 휘어 보인다(진입점 분산을 넣은 뒤 실제로 그렇게 됐다).
  // 어긋난 폭이 작으면 **도착 직전**에서 꺾는다 — 여러 간선이 노드 앞에서
  // 모여드는 모양이라 의도한 것으로 읽힌다. 크게 어긋났을 때만 한가운데서
  // 꺾는다(그 경우 도착 직전에 꺾으면 긴 가로줄이 다른 노드를 가로지른다).
  const horizontal = dir === 'LR' || dir === 'RL';
  const drift = horizontal ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x);
  const span = horizontal ? Math.abs(a.x - b.x) : Math.abs(a.y - b.y);
  const nearTarget = drift <= FAN_DRIFT;
  const ra = horizontal ? a.x : a.y, rb = horizontal ? b.x : b.y;
  const sgn = Math.sign(rb - ra) || 1;
  const lead = Math.min(FAN_LEAD, span / 2);
  const defaultKnee = nearTarget ? rb - sgn * lead : (ra + rb) / 2;
  // 지정된 꺾는 지점은 출발·도착 상자에서 lead 만큼은 떨어뜨린다.
  const clamp = (k: number) => span <= 2 * lead ? k
    : sgn > 0 ? Math.min(Math.max(k, ra + lead), rb - lead) : Math.max(Math.min(k, ra - lead), rb + lead);
  const oneKnee = (k: number): Point[] => horizontal
    ? [a, { x: k, y: a.y }, { x: k, y: b.y }, b]
    : [a, { x: a.x, y: k }, { x: b.x, y: k }, b];

  const preferred = o.knee !== undefined ? clamp(o.knee) : defaultKnee;
  let best = oneKnee(preferred);
  let bestCost = cost(best);
  if (bestCost === 0) return best;

  // 기본 지점이 막혔다 — 랭크축의 빈 차선에서 꺾어 본다.
  for (const k of laneCandidates(others, ra, rb, horizontal ? 'x' : 'y')) {
    const path = oneKnee(k);
    const c = cost(path);
    if (c < bestCost) { best = path; bestCost = c; }
    if (c === 0) return path;
  }

  // 그래도 막혔다 — 출발 직후 교차축의 빈 차선으로 비켜 가서 도착 직전에 돌아오는 6점 경로.
  const c0 = horizontal ? a.y : a.x, c1 = horizontal ? b.y : b.x;
  const between = others.filter((n) => {
    const [s, e] = horizontal ? [n.x, n.x + n.w] : [n.y, n.y + n.h];
    return e > Math.min(ra, rb) && s < Math.max(ra, rb);
  });
  const crossLanes = laneCandidates(between, Math.min(c0, c1) - 1e6, Math.max(c0, c1) + 1e6, horizontal ? 'y' : 'x')
    .filter((L) => Math.abs(L) < 1e5);
  const outer = between.length
    ? [Math.min(...between.map((n) => horizontal ? n.y : n.x)) - 24, Math.max(...between.map((n) => horizontal ? n.y + n.h : n.x + n.w)) + 24]
    : [];
  const k1 = ra + sgn * lead, k2 = rb - sgn * lead;
  for (const L of [...crossLanes, ...outer]) {
    const path = horizontal
      ? [a, { x: k1, y: a.y }, { x: k1, y: L }, { x: k2, y: L }, { x: k2, y: b.y }, b]
      : [a, { x: a.x, y: k1 }, { x: L, y: k1 }, { x: L, y: k2 }, { x: b.x, y: k2 }, b];
    const c = cost(path);
    if (c < bestCost) { best = path; bestCost = c; }
    if (c === 0) return path;
  }
  return best;
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

/**
 * 자기 자신으로 돌아오는 간선. 상자 한쪽에 고리를 낸다.
 *
 * 일반 경로로는 못 그린다 — 출발점과 도착점이 같아서 선의 길이가 0 이 되고
 * 화살촉 방향도 안 정해진다. 상자 위쪽에 사각 고리를 내어 나갔다 돌아오는
 * 모양으로 만든다(순차도의 자기 메시지와 같은 해법).
 */
function routeSelfLoop(box: Placed): { path: Point[]; labelAt: Point } {
  const inset = Math.min(box.w / 4, 18);
  const lift = 18;
  const left = box.x + inset;
  const right = box.x + box.w - inset;
  const top = box.y;
  const lane = top - lift;
  return {
    path: [
      { x: left, y: top },
      { x: left, y: lane },
      { x: right, y: lane },
      { x: right, y: top },
    ],
    labelAt: { x: (left + right) / 2, y: lane },
  };
}

export function routeEdge(
  from: Placed,
  to: Placed,
  dir: Dir,
  entryOffset = 0,
  opts: Omit<ForwardOpts, 'entryOffset'> = {},
): { path: Point[]; labelAt: Point } {
  // 같은 노드인지는 id 만으로 안 본다 — 호출자가 id 를 재사용하면(테스트
  // 픽스처가 그랬다) 서로 다른 두 상자가 자기 루프로 오인된다. 배치가 끝난
  // 뒤라 같은 노드는 좌표까지 같다.
  if (from.id === to.id && from.x === to.x && from.y === to.y) return routeSelfLoop(from);
  const fromC = center(from);
  const toC = center(to);
  const horizontal = dir === 'LR' || dir === 'RL';
  const exitOffset = opts.exitOffset ?? 0;
  const aligned = horizontal ? Math.abs(fromC.y + exitOffset - toC.y - entryOffset) < 0.5
                             : Math.abs(fromC.x + exitOffset - toC.x - entryOffset) < 0.5;

  let result: { path: Point[]; labelAt: Point };
  if (isBackEdge(from, to, dir)) {
    result = routeBackEdge(from, to, dir);
  } else {
    const path = routeForward(from, to, dir, aligned, { ...opts, entryOffset });
    result = { path, labelAt: { x: (fromC.x + toC.x) / 2, y: (fromC.y + toC.y) / 2 } };
  }

  result.path = dedupPoints(result.path);

  // Collapse to one point: fall back to back-edge to ensure renderable path
  if (result.path.length < 2) {
    result = routeBackEdge(from, to, dir);
  }

  return result;
}

/** 한 변에 슬롯 `count` 개를 벌려 놓을 때 `slot` 번째의 교차축 오프셋. 상자
 * 밖으로 나가지 않도록 폭(또는 높이)의 절반에서 여유를 뺀 만큼으로 자른다. */
function slotOffset(span: number, slot: number, count: number): number {
  if (count <= 1) return 0;
  const limit = Math.max(0, span / 2 - 10);
  const spacing = Math.min(20, (2 * limit) / (count - 1));
  return (slot - (count - 1) / 2) * spacing;
}

/** 부채꼴 안에서 이웃 간선의 꺾는 지점을 벌리는 간격. */
const FAN_STAGGER = 8;

export type Ports = { entryOffset: number; exitOffset: number; knee?: number };

/**
 * 간선마다 출구·입구 슬롯과 꺾는 지점을 정한다 — 한 노드에서 여러 간선이
 * 나가거나(부채꼴) 들어올 때.
 *
 * 그냥 두면 부채꼴의 간선들이 한 점에서 나가 같은 가로줄을 타다 갈라진다 —
 * 라벨이 그 공유 구간 위에 줄지어 놓여 어느 가지의 것인지 읽을 수 없었다(실측:
 * 네 간선이 90~130px 를 겹쳐 탔다). 출구는 목표의 교차축 위치 순으로 벌리고,
 * 꺾는 지점은 **어긋남이 큰 간선부터 먼저** 꺾는다 — 나가는 쪽은 출발 상자
 * 가까이에서, 들어오는 쪽은 도착 상자 가까이에서. 이 순서면 부채꼴 안의
 * 간선끼리 교차하지 않는다(바깥 간선의 가로줄이 안쪽 간선의 세로줄과 만나지
 * 않는다). 한 간선이 두 부채꼴에 다 속하면 큰 쪽을 따른다.
 */
export function planPorts(edges: { from: string; to: string }[], at: Map<string, Placed>, dir: Dir): Ports[] {
  const horizontal = dir === 'LR' || dir === 'RL';
  const cross = (p: Placed) => (horizontal ? p.y + p.h / 2 : p.x + p.w / 2);
  const rankOf = (p: Placed) => (horizontal ? p.x + p.w / 2 : p.y + p.h / 2);
  const side = (p: Placed) => (horizontal ? p.h : p.w);
  const ports: Ports[] = edges.map(() => ({ entryOffset: 0, exitOffset: 0 }));
  const out = new Map<string, number[]>();
  const inn = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const f = at.get(e.from), t = at.get(e.to);
    if (!f || !t || e.from === e.to) return;
    // 역방향 간선은 우회로를 따로 그리므로 부채꼴에 넣지 않는다.
    if (rankAxisDelta(f, t, dir) <= 0) return;
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(i);
    (inn.get(e.to) ?? inn.set(e.to, []).get(e.to)!).push(i);
  });
  const drift = (i: number) => Math.abs(cross(at.get(edges[i]!.to)!) - cross(at.get(edges[i]!.from)!));
  const sgnOf = (i: number) => Math.sign(rankOf(at.get(edges[i]!.to)!) - rankOf(at.get(edges[i]!.from)!)) || 1;
  const edgeBox = (i: number, which: 'from' | 'to') => at.get(edges[i]![which])!;
  const gapOf = (i: number) => {
    const f = edgeBox(i, 'from'), t = edgeBox(i, 'to');
    const fe = horizontal ? (dir === 'LR' ? f.x + f.w : f.x) : (dir === 'TD' ? f.y + f.h : f.y);
    const te = horizontal ? (dir === 'LR' ? t.x : t.x + t.w) : (dir === 'TD' ? t.y : t.y + t.h);
    return { fe, te, span: Math.abs(te - fe) };
  };
  const kneeChoice = new Map<number, { size: number; knee: number }>();
  const consider = (i: number, size: number, knee: number) => {
    const prev = kneeChoice.get(i);
    if (!prev || size > prev.size) kneeChoice.set(i, { size, knee });
  };

  for (const [id, idx] of out) {
    const node = at.get(id)!;
    [...idx].sort((p, q) => cross(edgeBox(p, 'to')) - cross(edgeBox(q, 'to')))
      .forEach((ei, slot) => { ports[ei]!.exitOffset = slotOffset(side(node), slot, idx.length); });
    if (idx.length < 2) continue;
    [...idx].sort((p, q) => drift(q) - drift(p)).forEach((ei, k) => {
      const { fe, span } = gapOf(ei);
      const lead = Math.min(FAN_LEAD, span / 2);
      const s = Math.min(FAN_STAGGER, Math.max(0, span - 2 * lead) / Math.max(1, idx.length - 1));
      consider(ei, idx.length, fe + sgnOf(ei) * (lead + s * k));
    });
  }
  for (const [id, idx] of inn) {
    const node = at.get(id)!;
    [...idx].sort((p, q) => cross(edgeBox(p, 'from')) - cross(edgeBox(q, 'from')))
      .forEach((ei, slot) => { ports[ei]!.entryOffset = slotOffset(side(node), slot, idx.length); });
    if (idx.length < 2) continue;
    [...idx].sort((p, q) => drift(q) - drift(p)).forEach((ei, k) => {
      const { te, span } = gapOf(ei);
      const lead = Math.min(FAN_LEAD, span / 2);
      const s = Math.min(FAN_STAGGER, Math.max(0, span - 2 * lead) / Math.max(1, idx.length - 1));
      consider(ei, idx.length, te - sgnOf(ei) * (lead + s * k));
    });
  }
  for (const [i, c] of kneeChoice) ports[i]!.knee = c.knee;
  return ports;
}
