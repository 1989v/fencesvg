import type { FlowModel } from '../parse/types';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { routeEdge } from '../layout/edge';
import { el, text, svgRoot, pathData, snapBox, snapPoint } from '../svg';
import { measureText } from '../text';
import { arrowMarker } from './flowchart';
import { ContentBBox, textBBox } from './bbox';
import { edgeLabel } from './label';
import { WEIGHT } from './theme';

const TERMINAL = 14;
const MIN_W = 72;
const H = 40;

export function drawState(model: FlowModel, theme: Theme, idPrefix: string, label: string): string {
  const isTerminal = (id: string) => id.startsWith('__t');
  const nodes: GraphNode[] = model.nodes.map((n) => isTerminal(n.id)
    ? { id: n.id, w: TERMINAL, h: TERMINAL }
    : { id: n.id, w: Math.max(MIN_W, measureText(n.label, theme.fontSize) + theme.pad * 2), h: H });

  const lay = layoutGraph(nodes, model.edges, model.dir);
  const at = new Map(lay.nodes.map((p) => [p.id, p]));
  const arrowId = `${idPrefix}-arrow`;

  const routed = model.edges.flatMap((e) => {
    const from = at.get(e.from), to = at.get(e.to);
    if (!from || !to) return [];
    return [{ e, ...routeEdge(from, to, model.dir) }];
  });

  // routeEdge 의 역방향 우회 경로와 라벨 텍스트는 layoutGraph 가 상자만으로
  // 잰 width/height 바깥으로 나갈 수 있다 — 실제로 그려질 모든 것(상자 +
  // 간선 경로 + 라벨)을 모아 콘텐츠 bbox 를 구하고 원점을 0 으로 옮긴다.
  const bbox = new ContentBBox({ minX: 0, minY: 0, maxX: lay.width, maxY: lay.height });
  for (const r of routed) {
    for (const pt of r.path) bbox.point(pt);
    if (r.e.label) bbox.box(edgeLabel(r.e.label, r.labelAt.x, r.labelAt.y, theme).box);
  }
  for (const n of model.nodes) {
    const p = at.get(n.id);
    if (!p || isTerminal(n.id)) continue;
    bbox.box(textBBox(p.x + p.w / 2, p.y + p.h / 2 + theme.fontSize / 3, n.label, theme.fontSize));
  }
  const shift = bbox.shift;

  const body: string[] = [arrowMarker(arrowId, theme.line)];

  for (const r of routed) {
    const path = r.path.map(shift).map(snapPoint);
    const labelAt = shift(r.labelAt);
    body.push(el('path', {
      d: pathData(path),
      fill: 'none', stroke: theme.line, 'stroke-width': 1,
      'marker-end': `url(#${arrowId})`,
    }));
    if (r.e.label) {
      body.push(...edgeLabel(r.e.label, labelAt.x, labelAt.y, theme).body);
    }
  }

  for (const n of model.nodes) {
    const p0 = at.get(n.id);
    if (!p0) continue;
    const p: Placed = snapBox({ ...p0, x: p0.x + bbox.dx, y: p0.y + bbox.dy });
    if (isTerminal(n.id)) {
      body.push(el('circle', { cx: p.x + p.w / 2, cy: p.y + p.h / 2, r: p.w / 2, fill: theme.ink }));
      continue;
    }
    // rx=h/2 로 통일해 흐름도(rx=var(--fs-radius) 사각형)와 한눈에 구분한다.
    body.push(el('rect', {
      x: p.x, y: p.y, width: p.w, height: p.h, rx: p.h / 2,
      fill: theme.nodeFill, stroke: theme.nodeBorder, 'stroke-width': 1,
    }));
    body.push(text(n.label, {
      x: p.x + p.w / 2, y: p.y + p.h / 2 + theme.fontSize / 3,
      'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.fontSize, 'font-weight': WEIGHT.label,
    }));
  }

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: 4 });
}
