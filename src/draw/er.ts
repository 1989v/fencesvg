import type { ErModel, Card } from '../parse/er';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { routeEdge, type Point } from '../layout/edge';
import { el, text, svgRoot, pathData, snapBox, snapPoint } from '../svg';
import { measureText } from '../text';
import { ContentBBox, textBBox } from './bbox';
import { edgeLabel, pointAtFraction } from './label';
import { WEIGHT } from './theme';

const H = 44;
// 라벨을 경로 중점이 아니라 시작 쪽 40% 지점에 — 한 엔티티에서 갈라지는 관계끼리
// 라벨이 안 겹치게. 값의 근거는 draw/flowchart.ts 의 LABEL_T 주석 참고.
const LABEL_T = 0.4;

/**
 * 까마귀발 표기에 쓰는 원점들. `at` 은 선이 엔티티 상자에 닿는 점,
 * `toward` 는 그 선의 다음 점(선이 상자에서 멀어지는 방향)이다.
 * 카디널리티는 최솟값 기호(원=0, 막대=1)와 최댓값 기호(막대=1, 까마귀발=N)
 * 두 개가 겹쳐 나온다 — `one` 은 막대만(1,1 을 단순화), `zeroOne` 은
 * 원 + 막대(0,1), `many` 는 막대 + 까마귀발(1,N), `zeroMany` 는
 * 원 + 까마귀발(0,N) 뿐이고 **막대는 없다** — 최솟값이 0 이면 "적어도
 * 하나" 를 뜻하는 막대를 그리지 않는다. 막대·까마귀발의 수렴점은 상자에서
 * 10px, 원은 그보다 더 바깥(16px) — 엔티티에서 멀어지는 순서로 막대/발 →
 * 원이 놓인다. svg 그리기와 bbox 계산(뒤로 가는 간선이 상자 밖으로 나가는
 * 경우를 포함해)이 같은 점을 써야 하므로 좌표 계산과 그리기를 분리해 둔다.
 */
function crowPoints(at: Point, toward: Point, card: Card) {
  const dx = toward.x - at.x, dy = toward.y - at.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;          // 선 방향 단위벡터
  const px = -uy, py = ux;                     // 수직 단위벡터
  const at2 = (d: number, s = 0): Point => ({ x: at.x + ux * d + px * s, y: at.y + uy * d + py * s });
  const many = card === 'many' || card === 'zeroMany';
  const zero = card === 'zeroOne' || card === 'zeroMany';
  const hasBar = !(zero && many); // zeroMany 만 막대가 빠진다
  return {
    barEnds: hasBar ? ([at2(10, 5), at2(10, -5)] as [Point, Point]) : undefined,
    bar: at2(10),
    feet: many ? [-5, 0, 5].map((s) => at2(0, s)) : [],
    circle: zero ? at2(16) : undefined,
  };
}

// 카디널리티 기호는 간선과 같은 역할(--fs-line) — 별도로 죽이지 않는다.
function crow(at: Point, toward: Point, card: Card, line: string): string[] {
  const { barEnds, bar, feet, circle } = crowPoints(at, toward, card);
  const out: string[] = [];
  if (barEnds) {
    out.push(el('line', { x1: barEnds[0].x, y1: barEnds[0].y, x2: barEnds[1].x, y2: barEnds[1].y, stroke: line, 'stroke-width': 1 }));
  }
  for (const tip of feet) {
    out.push(el('line', { x1: bar.x, y1: bar.y, x2: tip.x, y2: tip.y, stroke: line, 'stroke-width': 1 }));
  }
  if (circle) out.push(el('circle', { cx: circle.x, cy: circle.y, r: 3.5, fill: 'none', stroke: line, 'stroke-width': 1 }));
  return out;
}

/** crow 가 실제로 찍는 모든 점 — bbox 계산에 쓴다 */
function crowExtent(at: Point, toward: Point, card: Card): Point[] {
  const { barEnds, feet, circle } = crowPoints(at, toward, card);
  const pts: Point[] = [...(barEnds ?? []), ...feet];
  if (circle) pts.push(circle);
  return pts;
}

export function drawEr(model: ErModel, theme: Theme, idPrefix: string, label: string): string {
  const nodes: GraphNode[] = model.entities.map((e) => ({
    id: e.id,
    w: Math.max(88, measureText(e.id, theme.fontSize) + theme.pad * 2),
    h: H,
  }));
  const edges = model.rels.map((r) => ({ from: r.from, to: r.to }));
  const lay = layoutGraph(nodes, edges, 'LR');
  const at = new Map(lay.nodes.map((p) => [p.id, p]));

  const routed = model.rels.flatMap((r) => {
    const from = at.get(r.from), to = at.get(r.to);
    if (!from || !to) return [];
    return [{ r, ...routeEdge(from, to, 'LR') }];
  });

  // 상자만으로 잰 layoutGraph 의 width/height 밖으로 나갈 수 있는 것들:
  // 뒤로 가는 간선의 우회 경로, 관계 라벨 텍스트, 그리고 상자 모서리 바로
  // 밖으로 퍼지는 까마귀발 기호. 전부 모아 콘텐츠 bbox 를 구한다.
  const bbox = new ContentBBox({ minX: 0, minY: 0, maxX: lay.width, maxY: lay.height });
  for (const rt of routed) {
    for (const pt of rt.path) bbox.point(pt);
    if (rt.r.label) {
      const at1 = pointAtFraction(rt.path, LABEL_T);
      bbox.box(edgeLabel(rt.r.label, at1.x, at1.y, theme).box);
    }
    const from = rt.path[0]!, fromNext = rt.path[1]!;
    const to = rt.path[rt.path.length - 1]!, toPrev = rt.path[rt.path.length - 2]!;
    for (const pt of crowExtent(from, fromNext, rt.r.fromCard)) bbox.point(pt);
    for (const pt of crowExtent(to, toPrev, rt.r.toCard)) bbox.point(pt);
  }
  for (const e of model.entities) {
    const p = at.get(e.id);
    if (!p) continue;
    bbox.box(textBBox(p.x + p.w / 2, p.y + p.h / 2 + theme.fontSize / 3, e.id, theme.fontSize));
  }
  const shift = bbox.shift;

  const body: string[] = [];
  // 라벨은 엔티티보다 나중에 — 엔티티가 라벨을 덮어 가리는 걸 막는다. 간선
  // 경로·까마귀발 기호는 지금처럼 엔티티보다 먼저 그려 엔티티 밑에 깔린다.
  const labelBody: string[] = [];

  for (const rt of routed) {
    const path = rt.path.map(shift).map(snapPoint);
    body.push(el('path', {
      d: pathData(path),
      fill: 'none', stroke: theme.line, 'stroke-width': 1,
    }));
    body.push(...crow(path[0]!, path[1]!, rt.r.fromCard, theme.line));
    body.push(...crow(path[path.length - 1]!, path[path.length - 2]!, rt.r.toCard, theme.line));
    if (rt.r.label) {
      const at2 = pointAtFraction(path, LABEL_T);
      labelBody.push(...edgeLabel(rt.r.label, at2.x, at2.y, theme).body);
    }
  }

  for (const e of model.entities) {
    const p0: Placed | undefined = at.get(e.id);
    if (!p0) continue;
    const p: Placed = snapBox({ ...p0, x: p0.x + bbox.dx, y: p0.y + bbox.dy });
    body.push(el('rect', {
      x: p.x, y: p.y, width: p.w, height: p.h, rx: theme.radius,
      fill: theme.nodeFill, stroke: theme.nodeBorder, 'stroke-width': 1,
    }));
    body.push(text(e.id, {
      x: p.x + p.w / 2, y: p.y + p.h / 2 + theme.fontSize / 3,
      'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.fontSize, 'font-weight': WEIGHT.label,
    }));
  }

  body.push(...labelBody);

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: 6 });
}
