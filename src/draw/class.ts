import type { ClassModel, ClassRel } from '../parse/class';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { entryOffsetFor, routeEdge } from '../layout/edge';
import { el, text, svgRoot, pathData, snapBox, snapPoint } from '../svg';
import { measureText } from '../text';
import { ContentBBox, type Box } from './bbox';
import { WEIGHT, MUTED_OPACITY, metrics } from './theme';
import { arrowMarker } from './flowchart';
import { GAP, PAD_X, PAD_Y } from './label';


/**
 * class 의 관계 라벨은 세로선 옆에 붙는 왼쪽 정렬 칩이다 — flowchart 등의
 * 가운데 정렬 칩(`draw/label.ts` 의 `edgeLabel`)과 띄우는 축이 달라(선에서
 * 가로로 `GAP`px) 그 헬퍼를 그대로 못 쓴다. 패딩·간격 상수는 그쪽과 공유해
 * 칩 크기가 어긋나지 않게 한다.
 */
function relationLabelChip(labelStr: string, lineX: number, y: number, theme: Theme): { body: string[]; box: Box } {
  const x = lineX + GAP;
  const w = measureText(labelStr, theme.labelSize);
  const minX = x - PAD_X, maxX = x + w + PAD_X;
  const top = y - theme.labelSize * 0.8 - PAD_Y, bottom = y + theme.labelSize * 0.25 + PAD_Y;
  const box: Box = { minX, maxX, minY: top, maxY: bottom };
  const body = [
    el('rect', { x: minX, y: top, width: maxX - minX, height: bottom - top, rx: 3, fill: theme.labelChip }),
    text(labelStr, { x, y, fill: theme.label, 'font-size': theme.labelSize, 'font-weight': WEIGHT.edgeLabel }),
  ];
  return { body, box };
}

function markerFor(rel: ClassRel, idPrefix: string, theme: Theme): { id: string; def: string } {
  if (rel === 'inherit' || rel === 'implement') {
    const id = `${idPrefix}-tri`;
    // 상속·구현의 삼각형은 속이 빈 UML 삼각형이다 — `nodeFill` 을 그대로 써서,
    // 사이트가 노드 채움을 지정하면 겹치는 선이 삼각형 안으로 비치지 않는다
    // (fallback 은 transparent 라 CSS 가 없으면 지금처럼 빈 삼각형으로 보인다).
    return {
      id,
      def: el('defs', {}, [
        el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto' },
          [el('polygon', { points: '0,0 10,5 0,10', fill: theme.nodeFill, stroke: theme.line, 'stroke-width': 1.5 })]),
      ]),
    };
  }
  // 연관·의존 화살촉은 flowchart 와 같은 모양 — 따로 정의를 복제하지 않는다.
  return { id: `${idPrefix}-arrow`, def: arrowMarker(`${idPrefix}-arrow`, theme.line) };
}

export function drawClass(model: ClassModel, theme: Theme, idPrefix: string, label: string): string {
  const m = metrics(theme);
  const nodes: GraphNode[] = model.classes.map((c) => {
    const widest = Math.max(
      measureText(c.id, theme.fontSize),
      ...c.members.map((mem) => measureText(mem, m.memberSize)),
    );
    return { id: c.id, w: Math.max(Math.round(m.minW * 1.53), widest + m.padX * 2), h: m.headH + c.members.length * m.rowH + Math.round(theme.fontSize / 1.5) };
  });
  // 간선을 뒤집어 TD 로 돌린다 — 화살표 **머리**(상속의 부모)가 위에 온다.
  // 그래서 모든 화살표가 아래에서 위로 향하고, 라우팅 방향이 'BT' 하나로 통일된다.
  const lay = layoutGraph(nodes, model.rels.map((r) => ({ from: r.to, to: r.from })), 'TD', m.gap);
  const at = new Map(lay.nodes.map((p) => [p.id, p]));

  const inboundCount = new Map<string, number>();
  for (const r of model.rels) inboundCount.set(r.to, (inboundCount.get(r.to) ?? 0) + 1);
  const slot = new Map<string, number>();

  const routed = model.rels.flatMap((r) => {
    const from = at.get(r.from), to = at.get(r.to);
    if (!from || !to) return [];
    const i = slot.get(r.to) ?? 0;
    slot.set(r.to, i + 1);
    const off = entryOffsetFor(to, 'BT', i, inboundCount.get(r.to) ?? 1);
    return [{ r, ...routeEdge(from, to, 'BT', off) }];
  });

  // 상자만으로 잰 layoutGraph 의 width/height 밖으로 나갈 수 있는 것들 —
  // 뒤로 가는 간선의 우회 경로와 관계 라벨 텍스트를 콘텐츠 bbox 에 포함시킨다.
  const bbox = new ContentBBox({ minX: 0, minY: 0, maxX: lay.width, maxY: lay.height });
  for (const rt of routed) {
    for (const pt of rt.path) bbox.point(pt);
    if (rt.r.label) bbox.box(relationLabelChip(rt.r.label, rt.labelAt.x, rt.labelAt.y, theme).box);
  }
  const shift = bbox.shift;

  const defs = new Map<string, string>();
  for (const r of model.rels) {
    const m = markerFor(r.rel, idPrefix, theme);
    defs.set(m.id, m.def);
  }
  const body: string[] = [...defs.values()];

  for (const rt of routed) {
    const path = rt.path.map(shift).map(snapPoint);
    const labelAt = shift(rt.labelAt);
    const m = markerFor(rt.r.rel, idPrefix, theme);
    body.push(el('path', {
      d: pathData(path),
      fill: 'none', stroke: theme.line, 'stroke-width': 1,
      'stroke-dasharray': (rt.r.rel === 'implement' || rt.r.rel === 'depend') ? '3 3' : undefined,
      'marker-end': `url(#${m.id})`,
    }));
    if (rt.r.label) {
      body.push(...relationLabelChip(rt.r.label, labelAt.x, labelAt.y, theme).body);
    }
  }

  for (const c of model.classes) {
    const p0: Placed | undefined = at.get(c.id);
    if (!p0) continue;
    const p: Placed = snapBox({ ...p0, x: p0.x + bbox.dx, y: p0.y + bbox.dy });
    // 이름 칸엔 노드 채움을, 멤버 칸은 투명하게 둔다 — 칸이 나뉜 게 보인다.
    if (c.members.length > 0) {
      body.push(el('rect', {
        x: p.x, y: p.y, width: p.w, height: m.headH, rx: theme.radius,
        fill: theme.nodeFillAlt,
      }));
    }
    body.push(el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: theme.radius, fill: 'none', stroke: theme.nodeBorder, 'stroke-width': 1 }));
    body.push(text(c.id, {
      x: p.x + p.w / 2, y: p.y + m.headH / 2 + theme.fontSize / 2.4, 'text-anchor': 'middle',
      fill: theme.ink, 'font-size': theme.fontSize, 'font-weight': WEIGHT.label,
    }));
    if (c.members.length > 0) {
      body.push(el('line', { x1: p.x, y1: p.y + m.headH, x2: p.x + p.w, y2: p.y + m.headH, stroke: theme.lineFaint, 'stroke-width': 1 }));
      c.members.forEach((mem, i) => {
        body.push(text(mem, {
          x: p.x + m.memberInset, y: p.y + m.headH + m.memberBaseline + i * m.rowH,
          fill: theme.muted, 'fill-opacity': MUTED_OPACITY, 'font-size': m.memberSize, 'font-weight': WEIGHT.member,
        }));
      });
    }
  }

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: m.outerPad });
}
