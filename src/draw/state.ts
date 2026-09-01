import type { FlowModel } from '../parse/types';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { routeEdge, type Point } from '../layout/edge';
import { el, text, svgRoot } from '../svg';
import { measureText } from '../text';
import { arrowMarker } from './flowchart';

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

  // 가운데 정렬(text-anchor=middle) 라벨 하나의 바운딩 박스 — drawFlowchart 와 같은 근사식.
  const textBBox = (cx: number, baselineY: number, str: string, fontSize: number) => {
    const halfW = measureText(str, fontSize) / 2;
    return { minX: cx - halfW, maxX: cx + halfW, minY: baselineY - fontSize * 0.8, maxY: baselineY + fontSize * 0.25 };
  };

  // routeEdge 의 역방향 우회 경로와 라벨 텍스트는 layoutGraph 가 상자만으로
  // 잰 width/height 바깥으로 나갈 수 있다 — 실제로 그려질 모든 것(상자 +
  // 간선 경로 + 라벨)을 모아 콘텐츠 bbox 를 구하고 원점을 0 으로 옮긴다.
  let minX = 0, minY = 0, maxX = lay.width, maxY = lay.height;
  const grow = (b: { minX: number; maxX: number; minY: number; maxY: number }) => {
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  };
  for (const r of routed) {
    for (const pt of r.path) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
    }
    if (r.e.label) grow(textBBox(r.labelAt.x, r.labelAt.y - 5, r.e.label, theme.labelSize));
  }
  for (const n of model.nodes) {
    const p = at.get(n.id);
    if (!p || isTerminal(n.id)) continue;
    grow(textBBox(p.x + p.w / 2, p.y + p.h / 2 + theme.fontSize / 3, n.label, theme.fontSize));
  }
  const dx = -minX, dy = -minY;
  const shift = (pt: Point): Point => ({ x: pt.x + dx, y: pt.y + dy });

  const body: string[] = [arrowMarker(arrowId)];

  for (const r of routed) {
    const path = r.path.map(shift);
    const labelAt = shift(r.labelAt);
    body.push(el('polyline', {
      points: path.map((pt) => `${Math.round(pt.x)},${Math.round(pt.y)}`).join(' '),
      fill: 'none', stroke: theme.ink, 'stroke-width': 1.5, 'marker-end': `url(#${arrowId})`,
    }));
    if (r.e.label) {
      body.push(text(r.e.label, {
        x: labelAt.x, y: labelAt.y - 5, 'text-anchor': 'middle',
        fill: theme.ink, 'font-size': theme.labelSize,
      }));
    }
  }

  for (const n of model.nodes) {
    const p0 = at.get(n.id);
    if (!p0) continue;
    const p: Placed = { ...p0, x: p0.x + dx, y: p0.y + dy };
    if (isTerminal(n.id)) {
      body.push(el('circle', { cx: p.x + p.w / 2, cy: p.y + p.h / 2, r: p.w / 2, fill: theme.ink }));
      continue;
    }
    body.push(el('rect', {
      x: p.x, y: p.y, width: p.w, height: p.h, rx: 8,
      fill: 'none', stroke: theme.ink, 'stroke-width': 1.5,
    }));
    body.push(text(n.label, {
      x: p.x + p.w / 2, y: p.y + p.h / 2 + theme.fontSize / 3,
      'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.fontSize,
    }));
  }

  return svgRoot({ width: maxX - minX, height: maxY - minY, label, body, pad: 4 });
}
