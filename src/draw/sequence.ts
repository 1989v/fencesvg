import type { SeqModel } from '../parse/sequence';
import type { Theme } from './theme';
import { layoutSequence } from '../layout/sequence';
import { el, text, svgRoot, pathData, snapBox, snapPoint } from '../svg';
import { measureText } from '../text';
import { arrowMarker } from './flowchart';
import { ContentBBox } from './bbox';
import { edgeLabel } from './label';
import { WEIGHT } from './theme';

// 자기 자신에게 보내는 메시지는 직선으로 그릴 수 없다(x1===x2 면 폭 0 짜리
// 선이 되어 화살촉 방향도 안 정해진다) — 생명선 오른쪽으로 작은 사각 고리를
// 내어 돌아오는 모양으로 그린다.
const LOOP_W = 40;
const LOOP_H = 16;

export function drawSequence(model: SeqModel, theme: Theme, idPrefix: string, label: string): string {
  const lay = layoutSequence(model, theme);
  const arrowId = `${idPrefix}-arrow`;

  // 실제로 그려질 모든 것(생명선 + 메시지 선/라벨 + 자기 루프 + 노트
  // 상자/라벨 + 참가자 상자/이름)을 모아 콘텐츠 bbox 를 구한다 —
  // layoutSequence 의 width/height 는 열 너비만 잰 값이라, 자기 루프의
  // 오른쪽 여백이나 열보다 넓은 라벨·노트가 그 밖으로 나가면 그대로 잘린다.
  const bbox = new ContentBBox({ minX: 0, minY: 0, maxX: lay.width, maxY: lay.height });

  for (const a of model.actors) {
    const cx = lay.x.get(a)!;
    bbox.box({ minX: cx, maxX: cx, minY: lay.headH, maxY: lay.height - 8 });
  }
  model.steps.forEach((s, i) => {
    const y = lay.rowY[i]!;
    if (s.t === 'note') {
      const cx = lay.x.get(s.at)!;
      const w = measureText(s.label, theme.labelSize) + 20;
      bbox.box({ minX: cx - w / 2, maxX: cx + w / 2, minY: y - 14, maxY: y + 10 });
      return;
    }
    if (s.from === s.to) {
      const cx = lay.x.get(s.from)!;
      bbox.box({ minX: cx, maxX: cx + LOOP_W, minY: y, maxY: y + LOOP_H });
      bbox.box(edgeLabel(s.label, cx + LOOP_W / 2, y, theme.labelSize, theme.muted).box);
      return;
    }
    const x1 = lay.x.get(s.from)!, x2 = lay.x.get(s.to)!;
    bbox.box({ minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minY: y, maxY: y });
    bbox.box(edgeLabel(s.label, (x1 + x2) / 2, y, theme.labelSize, theme.muted).box);
  });
  for (const a of model.actors) {
    const cx = lay.x.get(a)!;
    const w = measureText(a, theme.fontSize) + theme.pad * 2;
    bbox.box({ minX: cx - w / 2, maxX: cx + w / 2, minY: 0, maxY: lay.headH - 8 });
  }

  const sx = (n: number) => n + bbox.dx;
  const sy = (n: number) => n + bbox.dy;

  const body: string[] = [arrowMarker(arrowId, theme.ink, theme.muted)];

  // 생명선 먼저 — 메시지가 그 위에 얹히고, 참가자 상자가 맨 위를 덮는다. faint 로
  // 낮춰(구분선 역할) 메시지·참가자 상자보다 한 단 죽인다.
  for (const a of model.actors) {
    const p1 = snapPoint({ x: sx(lay.x.get(a)!), y: sy(lay.headH) });
    const p2 = snapPoint({ x: sx(lay.x.get(a)!), y: sy(lay.height - 8) });
    body.push(el('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: theme.ink, 'stroke-width': 0.75, 'stroke-dasharray': '3 3', opacity: theme.faint,
    }));
  }

  model.steps.forEach((s, i) => {
    const y = sy(lay.rowY[i]!);
    if (s.t === 'note') {
      const cx = sx(lay.x.get(s.at)!);
      const w = measureText(s.label, theme.labelSize) + 20;
      const box = snapBox({ x: cx - w / 2, y: y - 14, w, h: 24 });
      body.push(el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 3, fill: 'none', stroke: theme.ink, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      body.push(text(s.label, { x: cx, y: y + 2, 'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.labelSize }));
      return;
    }
    if (s.from === s.to) {
      const cx = sx(lay.x.get(s.from)!);
      // 자기 메시지 루프도 간선이다 — muted 로, 다른 간선과 같은 굵기로.
      const pts = [
        { x: cx, y }, { x: cx + LOOP_W, y }, { x: cx + LOOP_W, y: y + LOOP_H }, { x: cx, y: y + LOOP_H },
      ].map(snapPoint);
      body.push(el('path', {
        d: pathData(pts),
        fill: 'none', stroke: theme.ink, 'stroke-opacity': theme.muted, 'stroke-width': 1,
        'stroke-dasharray': s.line === 'dotted' ? '3 3' : undefined,
        'marker-end': `url(#${arrowId})`,
      }));
      body.push(...edgeLabel(s.label, cx + LOOP_W / 2, y, theme.labelSize, theme.muted).body);
      return;
    }
    const p1 = snapPoint({ x: sx(lay.x.get(s.from)!), y });
    const p2 = snapPoint({ x: sx(lay.x.get(s.to)!), y });
    body.push(el('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: theme.ink, 'stroke-opacity': theme.muted, 'stroke-width': 1,
      'stroke-dasharray': s.line === 'dotted' ? '3 3' : undefined,
      'marker-end': `url(#${arrowId})`,
    }));
    body.push(...edgeLabel(s.label, (p1.x + p2.x) / 2, y, theme.labelSize, theme.muted).body);
  });

  // 참가자 상자를 마지막에 — 생명선 위를 덮는다. 옅은 채움을 줘 배경에서 뜨게 한다.
  for (const a of model.actors) {
    const cx = sx(lay.x.get(a)!);
    const w = measureText(a, theme.fontSize) + theme.pad * 2;
    const box = snapBox({ x: cx - w / 2, y: sy(0), w, h: lay.headH - 8 });
    body.push(el('rect', {
      x: box.x, y: box.y, width: box.w, height: box.h, rx: 4,
      fill: theme.ink, 'fill-opacity': theme.surface, stroke: theme.ink, 'stroke-width': 1,
    }));
    body.push(text(a, {
      x: cx, y: sy((lay.headH - 8) / 2 + theme.fontSize / 3),
      'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.fontSize, 'font-weight': WEIGHT.label,
    }));
  }

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: 6 });
}
