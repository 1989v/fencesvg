import type { ClassModel, ClassRel } from '../parse/class';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { routeEdge, type Point } from '../layout/edge';
import { el, text, svgRoot } from '../svg';
import { measureText } from '../text';

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

  // 왼쪽 정렬(관계 라벨) 텍스트 하나의 바운딩 박스.
  const leftTextBBox = (x: number, baselineY: number, str: string, fontSize: number) => ({
    minX: x, maxX: x + measureText(str, fontSize), minY: baselineY - fontSize * 0.8, maxY: baselineY + fontSize * 0.25,
  });

  // 상자만으로 잰 layoutGraph 의 width/height 밖으로 나갈 수 있는 것들 —
  // 뒤로 가는 간선의 우회 경로와 관계 라벨 텍스트를 콘텐츠 bbox 에 포함시킨다.
  let minX = 0, minY = 0, maxX = lay.width, maxY = lay.height;
  const grow = (b: { minX: number; maxX: number; minY: number; maxY: number }) => {
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  };
  for (const rt of routed) {
    for (const pt of rt.path) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
    }
    if (rt.r.label) grow(leftTextBBox(rt.labelAt.x + 6, rt.labelAt.y, rt.r.label, theme.labelSize));
  }
  const dx = -minX, dy = -minY;
  const shift = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });

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
    const p: Placed = { ...p0, x: p0.x + dx, y: p0.y + dy };
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

  return svgRoot({ width: maxX - minX, height: maxY - minY, label, body, pad: 6 });
}
