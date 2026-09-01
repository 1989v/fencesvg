import type { FlowModel } from '../parse/types';
import type { Theme } from './theme';
import { layoutGraph, type GraphNode, type Placed } from '../layout/graph';
import { routeEdge, type Point } from '../layout/edge';
import { el, text, svgRoot } from '../svg';
import { measureText } from '../text';

const MIN_W = 72;
const H = 44;

/**
 * `<marker>` 안의 `currentColor` 는 marker-end 로 참조하는 간선이 아니라
 * marker 자기 자신의 조상(사실상 이 defs 블록)을 기준으로 풀린다 — 참조하는
 * 요소의 색을 물려받으려면 SVG 의 `context-stroke` 가 따로 있어야 한다.
 * 지금은 모든 간선이 `theme.ink`(= currentColor) 라 두 기준이 같은 루트
 * 색으로 수렴해 우연히 맞는 것뿐이다. 간선에 `theme.accent` 를 쓰게 되면
 * 화살촉 색은 안 따라가고 이 defs 블록 기준의 색(보통 본문 글자색)으로 남는다.
 */
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

  // 가운데 정렬(text-anchor=middle) 라벨 하나의 바운딩 박스. 폰트 메트릭을
  // 정확히 재지 않으므로(measureText 는 근사치) 캡 하이트·디센더 쪽을
  // 넉넉하게 잡아 과소평가하지 않는 쪽으로 치우친다.
  const textBBox = (cx: number, baselineY: number, str: string, fontSize: number) => {
    const halfW = measureText(str, fontSize) / 2;
    return { minX: cx - halfW, maxX: cx + halfW, minY: baselineY - fontSize * 0.8, maxY: baselineY + fontSize * 0.25 };
  };

  // 역방향 간선의 우회 차선과, 가운데 정렬된 라벨(간선 라벨·노드 라벨) 둘 다
  // layoutGraph 가 상자만으로 잰 width/height 바깥으로 나갈 수 있다(routeEdge
  // 참고, 그리고 라벨은 상자 폭보다 넓으면 자기 앵커 좌우로 흘러나온다). 그
  // 폭을 여기서 미리 알 방법이 없으니, 실제로 그려질 모든 것(상자 + 간선
  // 경로 + 간선 라벨 + 노드 라벨)을 모아 진짜 콘텐츠 bbox 를 구하고 원점이
  // 0 이 되도록 통째로 옮긴다 — 안 그러면 그 바깥으로 나온 조각이 viewBox
  // 에서 잘린다.
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
    if (!p) continue;
    grow(textBBox(p.x + p.w / 2, p.y + p.h / 2 + theme.fontSize / 3, n.label, theme.fontSize));
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
