import type { FlowModel } from '../parse/types';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { routeEdge } from '../layout/edge';
import { el, text, svgRoot, pathData, snapBox, snapPoint } from '../svg';
import { measureText } from '../text';
import { ContentBBox, textBBox } from './bbox';
import { edgeLabel } from './label';
import { WEIGHT } from './theme';

const MIN_W = 72;
const H = 44;

/**
 * `<marker>` 안의 색은 marker-end 로 참조하는 간선이 아니라 marker 자기
 * 자신의 조상(사실상 이 defs 블록)을 기준으로 풀린다 — 참조하는 요소의
 * 색을 물려받으려면 SVG 의 `context-stroke` 가 따로 있어야 한다. 그래서
 * `ink` 를 호출자가 명시로 넘긴다: 간선 색과 다른 값을 쓰면(예: 간선에
 * `theme.accent`) 화살촉은 안 따라가고 여기서 받은 색으로 남는다.
 */
export function arrowMarker(id: string, ink: string, opacity: number): string {
  return el('defs', {}, [
    el('marker',
      { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' },
      [el('polygon', { points: '0,0 10,5 0,10', fill: ink, 'fill-opacity': opacity })]),
  ]);
}

/**
 * `isEmphasis` 가 색·굵기·채움을 한 번에 가른다 — 강조는 다이어그램당
 * 최대 1개(파서가 이미 보장)라 여기선 그냥 받은 대로 쓴다.
 */
function shapeOf(p: Placed, shape: string, theme: Theme, isEmphasis: boolean): string {
  const stroke = isEmphasis ? theme.accent : theme.ink;
  const strokeWidth = isEmphasis ? 1.25 : 1;
  const fill = isEmphasis ? theme.accent : theme.ink;
  const fillOpacity = isEmphasis ? theme.accentTint : theme.surface;
  if (shape === 'diamond') {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return el('polygon', {
      points: `${cx},${p.y} ${p.x + p.w},${cy} ${cx},${p.y + p.h} ${p.x},${cy}`,
      fill, 'fill-opacity': fillOpacity, stroke, 'stroke-width': strokeWidth,
    });
  }
  return el('rect', {
    x: p.x, y: p.y, width: p.w, height: p.h,
    rx: shape === 'round' ? p.h / 2 : 6,
    fill, 'fill-opacity': fillOpacity, stroke, 'stroke-width': strokeWidth,
  });
}

export function drawFlowchart(model: FlowModel, theme: Theme, idPrefix: string, label: string): string {
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
    w: Math.max(MIN_W, measureText(n.label, theme.fontSize) + theme.pad * 2) * (n.shape === 'diamond' ? 1.4 : 1),
    h: H,
  }));
  const lay = layoutGraph(nodes, model.edges, model.dir);
  const at = new Map(lay.nodes.map((p) => [p.id, p]));
  const arrowId = `${idPrefix}-arrow`;

  const routed = model.edges.flatMap((e) => {
    const from = at.get(e.from), to = at.get(e.to);
    if (!from || !to) return [];
    return [{ e, ...routeEdge(from, to, model.dir) }];
  });

  // 역방향 간선의 우회 차선과, 가운데 정렬된 라벨(간선 라벨·노드 라벨) 둘 다
  // layoutGraph 가 상자만으로 잰 width/height 바깥으로 나갈 수 있다(routeEdge
  // 참고, 그리고 라벨은 상자 폭보다 넓으면 자기 앵커 좌우로 흘러나온다). 그
  // 폭을 여기서 미리 알 방법이 없으니, 실제로 그려질 모든 것(상자 + 간선
  // 경로 + 간선 라벨 + 노드 라벨)을 모아 진짜 콘텐츠 bbox 를 구하고 원점이
  // 0 이 되도록 통째로 옮긴다 — 안 그러면 그 바깥으로 나온 조각이 viewBox
  // 에서 잘린다.
  const bbox = new ContentBBox({ minX: 0, minY: 0, maxX: lay.width, maxY: lay.height });
  for (const r of routed) {
    for (const pt of r.path) bbox.point(pt);
    if (r.e.label) bbox.box(edgeLabel(r.e.label, r.labelAt.x, r.labelAt.y, theme.labelSize, theme.muted).box);
  }
  for (const n of model.nodes) {
    const p = at.get(n.id);
    if (!p) continue;
    bbox.box(textBBox(p.x + p.w / 2, p.y + p.h / 2 + theme.fontSize / 3, n.label, theme.fontSize));
  }
  const shift = bbox.shift;

  const body: string[] = [arrowMarker(arrowId, theme.ink, theme.muted)];

  for (const r of routed) {
    const path = r.path.map(shift).map(snapPoint);
    const labelAt = shift(r.labelAt);
    body.push(el('path', {
      d: pathData(path),
      fill: 'none', stroke: theme.ink, 'stroke-opacity': theme.muted, 'stroke-width': 1,
      'stroke-dasharray': r.e.line === 'dotted' ? '3 3' : undefined,
      'marker-end': `url(#${arrowId})`,
    }));
    if (r.e.label) {
      body.push(...edgeLabel(r.e.label, labelAt.x, labelAt.y, theme.labelSize, theme.muted).body);
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
    const shape = n.shape === 'rect' && !hasIncoming.has(n.id) ? 'round' : n.shape;
    body.push(shapeOf(p, shape, theme, isEmphasis));
    body.push(text(n.label, {
      x: p.x + p.w / 2, y: p.y + p.h / 2 + theme.fontSize / 3,
      'text-anchor': 'middle', fill: color, 'font-size': theme.fontSize, 'font-weight': WEIGHT.label,
    }));
  }

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: 4 });
}
