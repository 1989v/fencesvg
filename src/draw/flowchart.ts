import type { FlowModel } from '../parse/types';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { entryOffsetFor, routeEdge } from '../layout/edge';
import { el, text, svgRoot, pathData, snapBox, snapPoint } from '../svg';
import { measureText } from '../text';
import { ContentBBox, textBBox, type Box } from './bbox';
import { chooseLabelT, edgeLabel, pointAtFraction } from './label';
import { WEIGHT, metrics } from './theme';

// 간선 라벨은 경로 중점이 아니라 시작 쪽 40% 지점에 둔다 — 같은 노드에서
// 갈라지는 두 간선(예: "실패"/"거절")은 중점 근처에서도 여전히 겹칠 수
// 있지만, 갈라져 나가는 방향을 따라 시작 쪽으로 가면 벌어져 있다. 35%는
// 실측(아래)에서 랭크를 여러 개 건너뛰는 긴 간선(검증 -.-> 반려)의 경로가
// 중간 랭크(승인)의 밴드를 지나는 지점과 겹쳐 그 랭크 노드 라벨과 부딪혔다
// — 0.20~0.50 을 0.01 단위로 쓸어 봤을 때 이 조합의 예시 다이어그램에서
// 겹침이 0 인 구간은 0.40~0.41 뿐이었다. 더 안정적인 해법(긴 간선을 점유된
// 랭크 밴드 밖으로 우회시키는 라우팅 변경)은 이 태스크 범위 밖이라 후속으로 남긴다.
const LABEL_T = 0.4;


/**
 * `<marker>` 안의 색은 marker-end 로 참조하는 간선이 아니라 marker 자기
 * 자신의 조상(사실상 이 defs 블록)을 기준으로 풀린다 — 참조하는 요소의
 * 색을 물려받으려면 SVG 의 `context-stroke` 가 따로 있어야 한다. 그래서
 * `line` 을 호출자가 명시로 넘긴다: 간선과 다른 값을 쓰면(예: `theme.accent`)
 * 화살촉은 안 따라가고 여기서 받은 값으로 남는다. `line` 은 이미
 * `var(--fs-line, currentColor)` 문자열이라 여기서 CSS 를 더 알 필요가 없다.
 */
export function arrowMarker(id: string, line: string): string {
  return el('defs', {}, [
    el('marker',
      { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' },
      [el('polygon', { points: '0,0 10,5 0,10', fill: line })]),
  ]);
}

/**
 * `isEmphasis` 가 색·굵기·채움을 한 번에 가른다 — 강조는 다이어그램당
 * 최대 1개(파서가 이미 보장)라 여기선 그냥 받은 대로 쓴다.
 */
function shapeOf(p: Placed, shape: string, theme: Theme, isEmphasis: boolean): string {
  const stroke = isEmphasis ? theme.accent : theme.nodeBorder;
  const strokeWidth = isEmphasis ? theme.accentStrokeWidth : 1;
  const fill = isEmphasis ? theme.accentFill : theme.nodeFill;
  if (shape === 'diamond') {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return el('polygon', {
      points: `${cx},${p.y} ${p.x + p.w},${cy} ${cx},${p.y + p.h} ${p.x},${cy}`,
      fill, stroke, 'stroke-width': strokeWidth,
    });
  }
  return el('rect', {
    x: p.x, y: p.y, width: p.w, height: p.h,
    rx: shape === 'round' ? p.h / 2 : theme.radius,
    fill, stroke, 'stroke-width': strokeWidth,
  });
}

export function drawFlowchart(model: FlowModel, theme: Theme, idPrefix: string, label: string): string {
  const m = metrics(theme);
  const nodes: GraphNode[] = model.nodes.map((n) => ({
    id: n.id,
    // 마름모는 같은 라벨에 더 넓은 자리가 필요하다 — 텍스트 밴드가 놓이는
    // 세로 구간에서 마름모 폭은 상자 폭보다 좁아지므로, 폭을 넉넉히 키워
    // 그 구간에서도 라벨이 윤곽 안에 남게 한다. `× 1.4` 는 상자 높이 H=44,
    // 텍스트 기준 fontSize 에서 나온 값이라 무한정 안전하지 않다 — 라벨
    // 텍스트폭 t, 상자 폭 W 라 할 때 안전 조건은 대략
    // `W ≥ t / (1 - fontSize/H)`(높이를 고려한 식)이고, 지금 값(H=44,
    // fontSize=13)에서는 한글 라벨 기준 약 50자를 넘기면 이 배율로도
    // 텍스트가 마름모 윤곽 밖으로 살짝 나간다(실측: 60자에서 margin -2.6px).
    // 20자 안팎의 실사용 라벨은 여유 있게 들어간다 — 이 배율을 늘리는 건
    // 다음 태스크가 필요할 때 판단.
    w: Math.max(m.minW, measureText(n.label, theme.fontSize) + m.padX * 2) * (n.shape === 'diamond' ? 1.4 : 1),
    h: m.nodeH,
  }));
  const lay = layoutGraph(nodes, model.edges, model.dir);
  const at = new Map(lay.nodes.map((p) => [p.id, p]));
  const arrowId = `${idPrefix}-arrow`;

  const inboundCount = new Map<string, number>();
  for (const e of model.edges) inboundCount.set(e.to, (inboundCount.get(e.to) ?? 0) + 1);
  const slot = new Map<string, number>();

  const routed = model.edges.flatMap((e) => {
    const from = at.get(e.from), to = at.get(e.to);
    if (!from || !to) return [];
    const i = slot.get(e.to) ?? 0;
    slot.set(e.to, i + 1);
    const off = entryOffsetFor(to, model.dir, i, inboundCount.get(e.to) ?? 1);
    return [{ e, labelT: LABEL_T, ...routeEdge(from, to, model.dir, off) }];
  });

  // 역방향 간선의 우회 차선과, 가운데 정렬된 라벨(간선 라벨·노드 라벨) 둘 다
  // layoutGraph 가 상자만으로 잰 width/height 바깥으로 나갈 수 있다(routeEdge
  // 참고, 그리고 라벨은 상자 폭보다 넓으면 자기 앵커 좌우로 흘러나온다). 그
  // 폭을 여기서 미리 알 방법이 없으니, 실제로 그려질 모든 것(상자 + 간선
  // 경로 + 간선 라벨 + 노드 라벨)을 모아 진짜 콘텐츠 bbox 를 구하고 원점이
  // 0 이 되도록 통째로 옮긴다 — 안 그러면 그 바깥으로 나온 조각이 viewBox
  // 에서 잘린다.
  const bbox = new ContentBBox({ minX: 0, minY: 0, maxX: lay.width, maxY: lay.height });
  // 라벨은 먼저 놓인 것부터 자리를 차지한다 — 뒤에 오는 라벨이 이걸 피한다.
  const placedLabels: Box[] = [];
  for (const r of routed) {
    for (const pt of r.path) bbox.point(pt);
    if (r.e.label) {
      r.labelT = chooseLabelT(r.path, r.e.label, theme, lay.nodes, placedLabels);
      const at1 = pointAtFraction(r.path, r.labelT);
      const chip = edgeLabel(r.e.label, at1.x, at1.y, theme).box;
      placedLabels.push(chip);
      bbox.box(chip);
    }
  }
  for (const n of model.nodes) {
    const p = at.get(n.id);
    if (!p) continue;
    bbox.box(textBBox(p.x + p.w / 2, p.y + p.h / 2 + theme.fontSize / 3, n.label, theme.fontSize));
  }
  const shift = bbox.shift;

  const body: string[] = [arrowMarker(arrowId, theme.line)];
  // 라벨은 노드보다 나중에 낸다 — 노드가 라벨 자리를 덮으면 배경 칩째로
  // 가려지던 문제(예: 마름모 아래 깔린 간선 라벨)를 막는다. 간선 자체는
  // 지금처럼 노드보다 먼저 그려 노드 밑에 깔린다.
  const labelBody: string[] = [];

  for (const r of routed) {
    const path = r.path.map(shift).map(snapPoint);
    body.push(el('path', {
      d: pathData(path),
      fill: 'none', stroke: theme.line, 'stroke-width': 1,
      'stroke-dasharray': r.e.line === 'dotted' ? '3 3' : undefined,
      'marker-end': `url(#${arrowId})`,
    }));
    if (r.e.label) {
      const at2 = pointAtFraction(path, r.labelT ?? LABEL_T);
      labelBody.push(...edgeLabel(r.e.label, at2.x, at2.y, theme).body);
    }
  }

  // 진입 간선이 없는 노드(그래프의 시작점)는 사각형이라도 둥글게 그린다 —
  // 마름모(판단)는 이미 다른 모양이니 그대로 두고, 시작만 따로 표시한다.
  const hasIncoming = new Set(model.edges.map((e) => e.to));
  for (const n of model.nodes) {
    const p0 = at.get(n.id);
    if (!p0) continue;
    const p: Placed = snapBox({ ...p0, x: p0.x + bbox.dx, y: p0.y + bbox.dy });
    const isEmphasis = model.emphasis.has(n.id);
    const color = isEmphasis ? theme.accent : theme.ink;
    const weight = isEmphasis ? theme.accentWeight : WEIGHT.label;
    const shape = n.shape === 'rect' && !hasIncoming.has(n.id) ? 'round' : n.shape;
    body.push(shapeOf(p, shape, theme, isEmphasis));
    body.push(text(n.label, {
      x: p.x + p.w / 2, y: p.y + p.h / 2 + theme.fontSize / 3,
      'text-anchor': 'middle', fill: color, 'font-size': theme.fontSize, 'font-weight': weight,
    }));
  }

  body.push(...labelBody);

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: Math.round(theme.fontSize / 3) });
}
