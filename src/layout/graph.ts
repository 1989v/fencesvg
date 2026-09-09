export type GraphNode = { id: string; w: number; h: number };
export type GraphEdge = { from: string; to: string };
export type Placed = { id: string; x: number; y: number; w: number; h: number };
export type GraphLayout = { nodes: Placed[]; width: number; height: number; rankOf: Map<string, number> };
export type Dir = 'LR' | 'RL' | 'TD' | 'BT';

const DEFAULT_GAP = { rank: 56, node: 24 };

/**
 * 랭크 = 진입 간선을 따라간 가장 긴 경로 길이.
 *
 * 순환은 먼저 끊는다 — Eades–Lin–Smyth 휴리스틱으로 노드를 한 줄로 세우고
 * (싱크는 뒤로, 소스는 앞으로, 남으면 나가는 간선이 들어오는 간선보다 많은
 * 것부터 앞으로), 그 줄에서 뒤로 가는 간선을 뒤집은 DAG 에 가장 긴 경로를
 * 매긴다. 전에는 BFS 가 되돌아오는 간선으로 랭크를 올리기만 해서, 순환 안의
 * 노드가 맨 아래로 밀리고 거기서 나가는 간선이 전부 역방향 우회선이 됐다
 * (실측: `S → E → Q → S` 에서 S 가 맨 아래로 가 우회선 셋이 한 곳에 뭉쳤다).
 * 뒤집힌 간선은 그리는 쪽에서 기하로 판정해(`isBackEdge`) 그대로 우회선으로
 * 그린다. 순서는 nodes 순회 순서를 따라 결정적이다.
 *
 * 마지막에 실사용 랭크 값만 모아 0..k-1 로 다시 매긴다 — 빈 층이 없게.
 */
function rank(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const has = new Set(ids);
  const links = edges.filter((e) => has.has(e.from) && has.has(e.to) && e.from !== e.to);

  // 1) 순환 끊기 — 한 줄 세우기
  const remaining = new Set(ids);
  const outOf = (id: string) => links.filter((e) => e.from === id && remaining.has(e.to)).length;
  const inOf = (id: string) => links.filter((e) => e.to === id && remaining.has(e.from)).length;
  const head: string[] = [];
  const tail: string[] = [];
  while (remaining.size > 0) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const id of ids) {
        if (!remaining.has(id)) continue;
        if (outOf(id) === 0) { tail.unshift(id); remaining.delete(id); moved = true; }
        else if (inOf(id) === 0) { head.push(id); remaining.delete(id); moved = true; }
      }
    }
    if (remaining.size === 0) break;
    let pick: string | null = null;
    let best = -Infinity;
    for (const id of ids) {
      if (!remaining.has(id)) continue;
      const d = outOf(id) - inOf(id);
      if (d > best) { best = d; pick = id; }
    }
    head.push(pick!); remaining.delete(pick!);
  }
  const pos = new Map([...head, ...tail].map((id, i) => [id, i]));

  // 2) 뒤로 가는 간선을 뒤집은 DAG 에 가장 긴 경로 (Kahn)
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of links) {
    const [from, to] = pos.get(e.from)! <= pos.get(e.to)! ? [e.from, e.to] : [e.to, e.from];
    succ.get(from)!.push(to);
    indeg.set(to, indeg.get(to)! + 1);
  }
  const r = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const to of succ.get(id)!) {
      r.set(to, Math.max(r.get(to)!, r.get(id)! + 1));
      indeg.set(to, indeg.get(to)! - 1);
      if (indeg.get(to) === 0) queue.push(to);
    }
  }

  // 3) 들어오는 간선이 없는 노드는 목표 바로 위 층으로 내린다 — 가장 긴 경로로만
  // 매기면 소스가 전부 맨 위 줄에 서서, 깊은 곳의 목표까지 긴 선으로 내려온다
  // (실측: `사용자 쿼리` 가 오른쪽 위에서 `search:app` 까지 그림 전체를 가로질렀다).
  // 목표가 여럿이면 가장 위 목표의 바로 위다. 소스의 후속은 소스가 아니므로 한 번이면 된다.
  const hasIn = new Set<string>();
  for (const s2 of succ.values()) for (const to of s2) hasIn.add(to);
  for (const id of ids) {
    if (hasIn.has(id)) continue;
    const targets = succ.get(id)!;
    if (targets.length === 0) continue;
    r.set(id, Math.min(...targets.map((t) => r.get(t)!)) - 1);
  }

  const used = Array.from(new Set(r.values())).sort((a, b) => a - b);
  const remap = new Map(used.map((v, i) => [v, i]));
  for (const [id, v] of r) r.set(id, remap.get(v)!);

  return r;
}

/**
 * 층 내 순서 — 앞 층에서 오는 이웃의 평균 위치(barycenter)로 정렬한다.
 *
 * `groupOf` 를 주면 같은 그룹끼리 붙여 놓는다. 테두리는 구성원의 경계 상자로
 * 그리므로, 구성원이 흩어지면 테두리 안에 남의 노드가 들어간다 — 그건 틀린
 * 그림이라 그리는 쪽이 그때는 테두리를 포기한다. 여기서 붙여 두면 그럴 일이
 * 대부분 사라진다.
 */
function order(layers: string[][], edges: GraphEdge[], groupOf?: Map<string, number>): void {
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
    layers[i] = sortLayer(layers[i]!, bary, groupOf);
  }
  // 첫 층은 barycenter 가 없다. 그룹만으로 한 번 묶어 준다 — 안 그러면
  // 첫 층에서 갈라진 그룹이 뒤 층까지 갈라진 채로 이어진다.
  if (groupOf && layers[0]) {
    const idx = new Map(layers[0].map((id, i) => [id, i]));
    layers[0] = sortLayer(layers[0], idx, groupOf);
  }
}

function sortLayer(layer: string[], bary: Map<string, number>, groupOf?: Map<string, number>): string[] {
  return layer
    .map((id, idx) => ({ id, idx }))
    .sort((a, b) => {
      if (groupOf) {
        // 그룹 없는 노드는 맨 뒤로 — 그룹끼리 먼저 붙인다.
        const ga = groupOf.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const gb = groupOf.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (ga !== gb) return ga - gb;
      }
      return (bary.get(a.id)! - bary.get(b.id)!) || (a.idx - b.idx);
    })
    .map((x) => x.id);
}

export function layoutGraph<E extends GraphEdge>(
  nodes: GraphNode[],
  edges: E[],
  dir: Dir,
  /** `group` 은 묶음 테두리가 구성원 밖으로 나가는 여백 — 주면 비구성원을 그 띠 밖으로 민다. */
  gap: { rank: number; node: number; group?: number } = DEFAULT_GAP,
  /** 노드 → 그룹 번호. 주면 같은 그룹끼리 층 안에서 붙여 놓는다. */
  groupOf?: Map<string, number>,
  /**
   * 간선이 두 층 사이에서 필요로 하는 랭크축 길이(px). 라벨이 선 위에 앉으면
   * 그 칩이 두 상자 사이에 들어가야 한다 — 기본 간격보다 넓은 라벨은 양쪽
   * 상자에 닿았다(실측). 이웃한 층 사이의 간선 중 가장 큰 값으로 그 사이만
   * 벌린다(mermaid 가 라벨을 더미 노드로 두는 것과 같은 효과).
   */
  need?: (e: E) => number,
  /**
   * 같은 두 층 사이의 간선들이 **함께** 필요로 하는 길이 — 합산한다. 세로 흐름의
   * 라벨은 가로 글자라 한 띠에 여럿이면 위아래로 쌓여야 하므로(실측: 한 띠에
   * 라벨 셋이 포개졌다) 라벨 수만큼 벌린다. 셋까지만 센다.
   */
  stackNeed?: (e: E) => number,
): GraphLayout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rankOf = rank(nodes, edges);
  const maxRank = Math.max(0, ...rankOf.values());
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) layers[rankOf.get(n.id)!]!.push(n.id);
  order(layers, edges, groupOf);

  const horizontal = dir === 'LR' || dir === 'RL';
  // 랭크축 = 층이 늘어서는 방향, 교차축 = 층 안에서 늘어서는 방향
  const rankSize = layers.map((l) => Math.max(0, ...l.map((id) => horizontal ? byId.get(id)!.w : byId.get(id)!.h)));
  const crossSize = layers.map((l) =>
    l.reduce((s, id) => s + (horizontal ? byId.get(id)!.h : byId.get(id)!.w), 0) + gap.node * Math.max(0, l.length - 1));

  // 층 사이 간격 — 기본값에서 출발해, 그 사이를 잇는 간선이 더 필요로 하면 벌린다.
  const rankGap = layers.slice(1).map(() => gap.rank);
  const stacked = layers.slice(1).map(() => [] as number[]);
  for (const e of edges) {
    const rf = rankOf.get(e.from), rt = rankOf.get(e.to);
    if (rf === undefined || rt === undefined || rt - rf !== 1) continue;
    if (need) rankGap[rf] = Math.max(rankGap[rf]!, need(e));
    if (stackNeed) { const s = stackNeed(e); if (s > 0) stacked[rf]!.push(s); }
  }
  stacked.forEach((list, i) => {
    if (list.length === 0) return;
    const top3 = list.sort((a, b) => b - a).slice(0, 3);
    rankGap[i] = Math.max(rankGap[i]!, top3.reduce((a, b) => a + b, 0));
  });
  const rankTotal = rankSize.reduce((a, b) => a + b, 0) + rankGap.reduce((a, b) => a + b, 0);
  let crossTotal = Math.max(0, ...crossSize);

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
    rankPos += rankSize[li]! + (rankGap[li] ?? 0);
  });

  // 묶음 띠 — 같은 그룹의 구성원이 걸친 층들에서 비구성원이 구성원의 교차축 범위
  // (테두리 여백 포함) 안에 들어오면 밖으로 민다. 층 안에서 구성원을 앞에 세우는
  // 것만으로는 부족했다: 다른 층의 비구성원이 옆에 서면(실측: 층 4 의 `결과` 가
  // 층 2~3 구성원의 폭 안에) 경계 상자에 들어가 테두리를 포기하게 된다.
  // 밀기는 항상 교차축 큰 쪽으로만 하므로 몇 번 돌면 멈춘다.
  if (groupOf && gap.group !== undefined) {
    const at = new Map(placed.map((p) => [p.id, p]));
    const start = (p: Placed) => (horizontal ? p.y : p.x);
    const end = (p: Placed) => (horizontal ? p.y + p.h : p.x + p.w);
    const shiftBy = (p: Placed, d: number) => { if (horizontal) p.y += d; else p.x += d; };
    const membersOf = new Map<number, Placed[]>();
    for (const [id, g] of groupOf) { const p = at.get(id); if (p) (membersOf.get(g) ?? membersOf.set(g, []).get(g)!).push(p); }
    const rows = layers.map((l) => l.map((id) => at.get(id)!));
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const [g, ms] of membersOf) {
        const lo = Math.min(...ms.map(start)) - gap.group, hi = Math.max(...ms.map(end)) + gap.group;
        for (const li of new Set(ms.map((p) => rankOf.get(p.id)!))) {
          const row = rows[li]!;
          const isMember = (p: Placed) => groupOf.get(p.id) === g;
          const first = row.findIndex(isMember);
          let last = -1; row.forEach((p, i) => { if (isMember(p)) last = i; });
          // 뒤쪽 침입자 — 띠 끝 너머로 민다(뒤따르는 노드도 같이)
          for (let k = last + 1; k < row.length; k++) {
            const n = row[k]!;
            if (start(n) < hi && end(n) > lo) {
              const d = hi + gap.node - start(n);
              if (d > 0) { for (let j = k; j < row.length; j++) shiftBy(row[j]!, d); moved = true; }
              break;
            }
          }
          // 앞쪽 침입자 — 구성원(과 그 뒤)을 침입자 끝 너머로 민다
          for (let k = first - 1; k >= 0; k--) {
            const n = row[k]!;
            if (start(n) < hi && end(n) > lo) {
              const d = end(n) + gap.group + gap.node - start(row[first]!);
              if (d > 0) { for (let j = first; j < row.length; j++) shiftBy(row[j]!, d); moved = true; }
              break;
            }
          }
        }
      }
      if (!moved) break;
    }
    crossTotal = Math.max(crossTotal, ...placed.map(end));
  }

  const width = horizontal ? rankTotal : crossTotal;
  const height = horizontal ? crossTotal : rankTotal;

  // RL·BT 는 LR·TD 를 랭크축에서 뒤집은 것이다. 배치 로직을 두 벌 갖지 않는다.
  if (dir === 'RL') for (const p of placed) p.x = width - p.x - p.w;
  if (dir === 'BT') for (const p of placed) p.y = height - p.y - p.h;

  return { nodes: placed, width, height, rankOf };
}
