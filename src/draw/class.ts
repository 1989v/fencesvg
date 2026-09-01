import type { ClassModel, ClassRel } from '../parse/class';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { routeEdge } from '../layout/edge';
import { el, text, svgRoot } from '../svg';
import { measureText } from '../text';
import { ContentBBox, leftTextBBox } from './bbox';

const ROW = 18;
const HEAD = 28;

function markerFor(rel: ClassRel, idPrefix: string, ink: string): { id: string; def: string } {
  if (rel === 'inherit' || rel === 'implement') {
    const id = `${idPrefix}-tri`;
    return {
      id,
      def: el('defs', {}, [
        el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto' },
          [el('polygon', { points: '0,0 10,5 0,10', fill: 'none', stroke: ink, 'stroke-width': 1.5 })]),
      ]),
    };
  }
  const id = `${idPrefix}-arrow`;
  return {
    id,
    def: el('defs', {}, [
      el('marker', { id, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' },
        [el('polygon', { points: '0,0 8,4 0,8', fill: ink })]),
    ]),
  };
}

export function drawClass(model: ClassModel, theme: Theme, idPrefix: string, label: string): string {
  const nodes: GraphNode[] = model.classes.map((c) => {
    const widest = Math.max(
      measureText(c.id, theme.fontSize),
      ...c.members.map((m) => measureText(m, theme.labelSize)),
    );
    return { id: c.id, w: Math.max(110, widest + theme.pad * 2), h: HEAD + c.members.length * ROW + 8 };
  });
  // 간선을 뒤집어 TD 로 돌린다 — 화살표 **머리**(상속의 부모)가 위에 온다.
  // 그래서 모든 화살표가 아래에서 위로 향하고, 라우팅 방향이 'BT' 하나로 통일된다.
  const lay = layoutGraph(nodes, model.rels.map((r) => ({ from: r.to, to: r.from })), 'TD');
  const at = new Map(lay.nodes.map((p) => [p.id, p]));

  const routed = model.rels.flatMap((r) => {
    const from = at.get(r.from), to = at.get(r.to);
    if (!from || !to) return [];
    return [{ r, ...routeEdge(from, to, 'BT') }];
  });

  // 상자만으로 잰 layoutGraph 의 width/height 밖으로 나갈 수 있는 것들 —
  // 뒤로 가는 간선의 우회 경로와 관계 라벨 텍스트를 콘텐츠 bbox 에 포함시킨다.
  const bbox = new ContentBBox({ minX: 0, minY: 0, maxX: lay.width, maxY: lay.height });
  for (const rt of routed) {
    for (const pt of rt.path) bbox.point(pt);
    if (rt.r.label) bbox.box(leftTextBBox(rt.labelAt.x + 6, rt.labelAt.y, rt.r.label, theme.labelSize));
  }
  const shift = bbox.shift;

  const defs = new Map<string, string>();
  for (const r of model.rels) {
    const m = markerFor(r.rel, idPrefix, theme.ink);
    defs.set(m.id, m.def);
  }
  const body: string[] = [...defs.values()];

  for (const rt of routed) {
    const path = rt.path.map(shift);
    const labelAt = shift(rt.labelAt);
    const m = markerFor(rt.r.rel, idPrefix, theme.ink);
    body.push(el('polyline', {
      points: path.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' '),
      fill: 'none', stroke: theme.ink, 'stroke-width': 1.5,
      'stroke-dasharray': (rt.r.rel === 'implement' || rt.r.rel === 'depend') ? '4 3' : undefined,
      'marker-end': `url(#${m.id})`,
    }));
    if (rt.r.label) {
      body.push(text(rt.r.label, {
        x: labelAt.x + 6, y: labelAt.y, fill: theme.ink, 'font-size': theme.labelSize,
      }));
    }
  }

  for (const c of model.classes) {
    const p0: Placed | undefined = at.get(c.id);
    if (!p0) continue;
    const p: Placed = { ...p0, x: p0.x + bbox.dx, y: p0.y + bbox.dy };
    body.push(el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 4, fill: 'none', stroke: theme.ink, 'stroke-width': 1.5 }));
    body.push(text(c.id, {
      x: p.x + p.w / 2, y: p.y + 19, 'text-anchor': 'middle',
      fill: theme.ink, 'font-size': theme.fontSize,
    }));
    if (c.members.length > 0) {
      body.push(el('line', { x1: p.x, y1: p.y + HEAD, x2: p.x + p.w, y2: p.y + HEAD, stroke: theme.ink, 'stroke-width': 1 }));
      c.members.forEach((mem, i) => {
        body.push(text(mem, {
          x: p.x + 8, y: p.y + HEAD + 14 + i * ROW,
          fill: theme.ink, 'font-size': theme.labelSize,
        }));
      });
    }
  }

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: 6 });
}
