import type { FlowModel } from '../parse/types';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { routeEdge, type Point } from '../layout/edge';
import { el, text, svgRoot } from '../svg';
import { measureText } from '../text';

const MIN_W = 72;
const H = 44;

export function arrowMarker(id: string): string {
  return el('defs', {}, [
    el('marker',
      { id, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' },
      [el('polygon', { points: '0,0 8,4 0,8', fill: 'currentColor' })]),
  ]);
}

function shapeOf(p: Placed, shape: string, stroke: string): string {
  if (shape === 'diamond') {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return el('polygon', {
      points: `${cx},${p.y} ${p.x + p.w},${cy} ${cx},${p.y + p.h} ${p.x},${cy}`,
      fill: 'none', stroke, 'stroke-width': 1.5,
    });
  }
  return el('rect', {
    x: p.x, y: p.y, width: p.w, height: p.h,
    rx: shape === 'round' ? p.h / 2 : 6,
    fill: 'none', stroke, 'stroke-width': 1.5,
  });
}

export function drawFlowchart(model: FlowModel, theme: Theme, idPrefix: string, label: string): string {
  const nodes: GraphNode[] = model.nodes.map((n) => ({
    id: n.id,
    // 마름모는 같은 라벨에 더 넓은 자리가 필요하다 — 텍스트 밴드가 놓이는
    // 세로 구간에서 마름모 폭은 상자 폭보다 좁아지므로, 폭을 넉넉히 키워
    // 그 구간에서도 라벨이 윤곽 안에 남게 한다
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

  // 역방향 간선은 상자 주위로 우회하며 layoutGraph 가 잰 width/height 바깥으로
  // 나갈 수 있다(routeEdge 참고). 그 폭을 여기서 미리 알 방법이 없으니, 실제로
  // 그려질 모든 점(상자 + 간선 경로)을 모아 진짜 콘텐츠 bbox 를 구하고 원점이
  // 0 이 되도록 통째로 옮긴다 — 안 그러면 우회 구간이 viewBox 밖에서 잘린다.
  let minX = 0, minY = 0, maxX = lay.width, maxY = lay.height;
  for (const r of routed) {
    for (const pt of r.path) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
    }
  }
  const dx = -minX, dy = -minY;
  const shift = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });

  const body: string[] = [arrowMarker(arrowId)];

  for (const r of routed) {
    const path = r.path.map(shift);
    const labelAt = shift(r.labelAt);
    body.push(el('polyline', {
      points: path.map((pt) => `${Math.round(pt.x)},${Math.round(pt.y)}`).join(' '),
      fill: 'none', stroke: theme.ink, 'stroke-width': 1.5,
      'stroke-dasharray': r.e.line === 'dotted' ? '4 3' : undefined,
      'marker-end': `url(#${arrowId})`,
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
    const color = model.emphasis.has(n.id) ? theme.accent : theme.ink;
    body.push(shapeOf(p, n.shape, color));
    body.push(text(n.label, {
      x: p.x + p.w / 2, y: p.y + p.h / 2 + theme.fontSize / 3,
      'text-anchor': 'middle', fill: color, 'font-size': theme.fontSize,
    }));
  }

  return svgRoot({ width: maxX - minX, height: maxY - minY, label, body, pad: 4 });
}
