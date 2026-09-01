export type GraphNode = { id: string; w: number; h: number };
export type GraphEdge = { from: string; to: string };
export type Placed = { id: string; x: number; y: number; w: number; h: number };
export type GraphLayout = { nodes: Placed[]; width: number; height: number; rankOf: Map<string, number> };
export type Dir = 'LR' | 'RL' | 'TD' | 'BT';

const DEFAULT_GAP = { rank: 56, node: 24 };

/**
 * 랭크 = 진입 간선을 따라간 가장 긴 경로 길이.
 * 순환이 있으면 이미 방문한 노드를 건너뛰어 끝나게 한다 — 순환 그래프의
 * "옳은" 랭크는 정의되지 않지만, 안 끝나는 것보다 임의로 끊는 편이 낫다.
 *
 * 시작점은 **컴포넌트별로** 심는다. 전역에서 한 번만 심으면 진입 간선이
 * 0 인 노드가 없는 컴포넌트(다른 컴포넌트와 안 이어진 순수 순환)는 아예
 * 큐에 못 들어가 방문되지 않는다 — 그 컴포넌트는 조용히 전부 랭크 0 으로
 * 남는다.
 *
 * BFS 가 끝난 뒤 실사용 랭크 값만 모아 0..k-1 로 다시 매긴다. 역행 간선은
 * 랭크를 올릴 뿐 그 노드를 다시 큐에 넣지 않으므로 중간 값이 통째로
 * 비는 경우가 있다 — 압축이 선두·중간·말단 어디의 빈 층이든 없앤다.
 */
function rank(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>(); // 무향 — 약연결 컴포넌트 판정용
  for (const n of nodes) { succ.set(n.id, []); indeg.set(n.id, 0); adj.set(n.id, []); }
  for (const e of edges) {
    if (!succ.has(e.from) || !succ.has(e.to)) continue;
    succ.get(e.from)!.push(e.to);
    indeg.set(e.to, indeg.get(e.to)! + 1);
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }

  // 약연결 컴포넌트로 분할한다 — nodes 순회 순서를 그대로 따라가 결정적이다
  const compOf = new Map<string, number>();
  let compCount = 0;
  for (const n of nodes) {
    if (compOf.has(n.id)) continue;
    const stack = [n.id];
    compOf.set(n.id, compCount);
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const nb of adj.get(id)!) {
        if (!compOf.has(nb)) { compOf.set(nb, compCount); stack.push(nb); }
      }
    }
    compCount++;
  }

  const r = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const seen = new Set<string>();
  const queue: string[] = [];
  for (let c = 0; c < compCount; c++) {
    const inComp = nodes.filter((n) => compOf.get(n.id) === c);
    const starts = inComp.filter((n) => indeg.get(n.id) === 0);
    // 진입 간선이 전부 있는 순환만 남으면 시작점이 없다 — 컴포넌트의 첫
    // 노드(nodes 순서)를 시작점으로 삼는다
    const seeds = starts.length > 0 ? starts : inComp.slice(0, 1);
    for (const s of seeds) { seen.add(s.id); queue.push(s.id); }
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const to of succ.get(id)!) {
      r.set(to, Math.max(r.get(to)!, r.get(id)! + 1));
      if (!seen.has(to)) { seen.add(to); queue.push(to); }
    }
  }

  const used = Array.from(new Set(r.values())).sort((a, b) => a - b);
  const remap = new Map(used.map((v, i) => [v, i]));
  for (const [id, v] of r) r.set(id, remap.get(v)!);

  return r;
}

/** 층 내 순서 — 앞 층에서 오는 이웃의 평균 위치(barycenter)로 정렬한다 */
function order(layers: string[][], edges: GraphEdge[]): void {
  const pred = new Map<string, string[]>();
  for (const e of edges) {
    if (!pred.has(e.to)) pred.set(e.to, []);
    pred.get(e.to)!.push(e.from);
  }
  for (let i = 1; i < layers.length; i++) {
    const prevIndex = new Map(layers[i - 1]!.map((id, idx) => [id, idx]));
    const bary = new Map<string, number>();
    layers[i]!.forEach((id, idx) => {
      const ps = (pred.get(id) ?? []).map((p) => prevIndex.get(p)).filter((v): v is number => v !== undefined);
      // 앞 층에 이웃이 없으면 제자리를 지킨다 — 결정성을 위해 idx 를 쓴다
      bary.set(id, ps.length === 0 ? idx : ps.reduce((a, b) => a + b, 0) / ps.length);
    });
    layers[i] = layers[i]!
      .map((id, idx) => ({ id, idx }))
      .sort((a, b) => (bary.get(a.id)! - bary.get(b.id)!) || (a.idx - b.idx))
      .map((x) => x.id);
  }
}

export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  dir: Dir,
  gap: { rank: number; node: number } = DEFAULT_GAP,
): GraphLayout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rankOf = rank(nodes, edges);
  const maxRank = Math.max(0, ...rankOf.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) layers[rankOf.get(n.id)!]!.push(n.id);
  order(layers, edges);

  const horizontal = dir === 'LR' || dir === 'RL';
  // 랭크축 = 층이 늘어서는 방향, 교차축 = 층 안에서 늘어서는 방향
  const rankSize = layers.map((l) => Math.max(0, ...l.map((id) => horizontal ? byId.get(id)!.w : byId.get(id)!.h)));
  const crossSize = layers.map((l) =>
    l.reduce((s, id) => s + (horizontal ? byId.get(id)!.h : byId.get(id)!.w), 0) + gap.node * Math.max(0, l.length - 1));

  const rankTotal = rankSize.reduce((a, b) => a + b, 0) + gap.rank * Math.max(0, layers.length - 1);
  const crossTotal = Math.max(0, ...crossSize);

  const placed: Placed[] = [];
  let rankPos = 0;
  layers.forEach((layer, li) => {
    let crossPos = (crossTotal - crossSize[li]!) / 2;   // 층을 교차축 가운데로
    for (const id of layer) {
      const n = byId.get(id)!;
      const along = rankPos + (rankSize[li]! - (horizontal ? n.w : n.h)) / 2;
      placed.push(horizontal
        ? { id, x: along, y: crossPos, w: n.w, h: n.h }
        : { id, x: crossPos, y: along, w: n.w, h: n.h });
      crossPos += (horizontal ? n.h : n.w) + gap.node;
    }
    rankPos += rankSize[li]! + gap.rank;
  });

  const width = horizontal ? rankTotal : crossTotal;
  const height = horizontal ? crossTotal : rankTotal;

  // RL·BT 는 LR·TD 를 랭크축에서 뒤집은 것이다. 배치 로직을 두 벌 갖지 않는다.
  if (dir === 'RL') for (const p of placed) p.x = width - p.x - p.w;
  if (dir === 'BT') for (const p of placed) p.y = height - p.y - p.h;

  return { nodes: placed, width, height, rankOf };
}
