import type { SeqModel } from '../parse/sequence';
import type { Theme } from './theme';
import { layoutSequence } from '../layout/sequence';
import { el, text, svgRoot } from '../svg';
import { measureText } from '../text';
import { arrowMarker } from './flowchart';
import { ContentBBox, textBBox } from './bbox';

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
      bbox.box(textBBox(cx + LOOP_W / 2, y - 6, s.label, theme.labelSize));
      return;
    }
    const x1 = lay.x.get(s.from)!, x2 = lay.x.get(s.to)!;
    bbox.box({ minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minY: y, maxY: y });
    bbox.box(textBBox((x1 + x2) / 2, y - 6, s.label, theme.labelSize));
  });
  for (const a of model.actors) {
    const cx = lay.x.get(a)!;
    const w = measureText(a, theme.fontSize) + theme.pad * 2;
    bbox.box({ minX: cx - w / 2, maxX: cx + w / 2, minY: 0, maxY: lay.headH - 8 });
  }

  const sx = (n: number) => n + bbox.dx;
  const sy = (n: number) => n + bbox.dy;

  const body: string[] = [arrowMarker(arrowId, theme.ink)];

  // 생명선 먼저 — 메시지가 그 위에 얹히고, 참가자 상자가 맨 위를 덮는다
  for (const a of model.actors) {
    const cx = sx(lay.x.get(a)!);
    body.push(el('line', {
      x1: cx, y1: sy(lay.headH), x2: cx, y2: sy(lay.height - 8),
      stroke: theme.ink, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.5,
    }));
  }

  model.steps.forEach((s, i) => {
    const y = sy(lay.rowY[i]!);
    if (s.t === 'note') {
      const cx = sx(lay.x.get(s.at)!);
      const w = measureText(s.label, theme.labelSize) + 20;
      body.push(el('rect', { x: cx - w / 2, y: y - 14, width: w, height: 24, rx: 3, fill: 'none', stroke: theme.ink, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      body.push(text(s.label, { x: cx, y: y + 2, 'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.labelSize }));
      return;
    }
    if (s.from === s.to) {
      const cx = sx(lay.x.get(s.from)!);
      body.push(el('polyline', {
        points: [`${cx},${y}`, `${cx + LOOP_W},${y}`, `${cx + LOOP_W},${y + LOOP_H}`, `${cx},${y + LOOP_H}`].join(' '),
        fill: 'none', stroke: theme.ink, 'stroke-width': 1.5,
        'stroke-dasharray': s.line === 'dotted' ? '4 3' : undefined,
        'marker-end': `url(#${arrowId})`,
      }));
      body.push(text(s.label, {
        x: cx + LOOP_W / 2, y: y - 6, 'text-anchor': 'middle',
        fill: theme.ink, 'font-size': theme.labelSize,
      }));
      return;
    }
    const x1 = sx(lay.x.get(s.from)!);
    const x2 = sx(lay.x.get(s.to)!);
    body.push(el('line', {
      x1, y1: y, x2, y2: y,
      stroke: theme.ink, 'stroke-width': 1.5,
      'stroke-dasharray': s.line === 'dotted' ? '4 3' : undefined,
      'marker-end': `url(#${arrowId})`,
    }));
    body.push(text(s.label, {
      x: (x1 + x2) / 2, y: y - 6, 'text-anchor': 'middle',
      fill: theme.ink, 'font-size': theme.labelSize,
    }));
  });

  // 참가자 상자를 마지막에 — 생명선 위를 덮는다
  for (const a of model.actors) {
    const cx = sx(lay.x.get(a)!);
    const w = measureText(a, theme.fontSize) + theme.pad * 2;
    body.push(el('rect', { x: cx - w / 2, y: sy(0), width: w, height: lay.headH - 8, rx: 4, fill: 'none', stroke: theme.ink, 'stroke-width': 1.5 }));
    body.push(text(a, {
      x: cx, y: sy((lay.headH - 8) / 2 + theme.fontSize / 3),
      'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.fontSize,
    }));
  }

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: 6 });
}
