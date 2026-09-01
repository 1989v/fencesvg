import type { SeqModel, SeqHead } from '../parse/sequence';
import type { Theme } from './theme';
import { layoutSequence, visibleSteps } from '../layout/sequence';
import { el, text, svgRoot, pathData, snapBox, snapPoint } from '../svg';
import { measureText } from '../text';
import { arrowMarker, crossMarker } from './flowchart';
import { ContentBBox } from './bbox';
import { edgeLabel } from './label';
import { WEIGHT, metrics } from './theme';

// 자기 자신에게 보내는 메시지는 직선으로 그릴 수 없다(x1===x2 면 폭 0 짜리
// 선이 되어 화살촉 방향도 안 정해진다) — 생명선 오른쪽으로 작은 사각 고리를
// 내어 돌아오는 모양으로 그린다.

/** 비동기 메시지(`-)`)의 속 빈 화살촉 — 선 두 개라 채운 삼각형과 확실히 갈린다. */
function asyncMarker(id: string, line: string): string {
  return el('defs', {}, [
    el('marker',
      { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto' },
      [
        el('line', { x1: 1, y1: 1, x2: 9, y2: 5, stroke: line, 'stroke-width': 1.4 }),
        el('line', { x1: 1, y1: 9, x2: 9, y2: 5, stroke: line, 'stroke-width': 1.4 }),
      ]),
  ]);
}

/**
 * `activate`/`deactivate` 를 생명선 위 상자 구간으로 바꾼다.
 *
 * 이 두 단계는 행을 차지하지 않으므로(메시지·노트만 행이 된다) 행 번호
 * 공간으로 옮겨야 한다. `activate` 를 만나면 그 시점의 행 번호를 열어 두고,
 * `deactivate` 에서 닫는다. 안 닫힌 것은 마지막 행까지로 본다 — 원문이
 * 빠뜨렸다고 그림을 포기할 이유가 없다.
 */
function activationSpans(model: SeqModel): { at: string; start: number; end: number }[] {
  const spans: { at: string; start: number; end: number }[] = [];
  const open = new Map<string, number[]>();
  let row = 0;
  for (const step of model.steps) {
    if (step.t === 'activate') {
      const stack = open.get(step.at) ?? [];
      stack.push(row);
      open.set(step.at, stack);
      continue;
    }
    if (step.t === 'deactivate') {
      const stack = open.get(step.at);
      const start = stack?.pop();
      if (start !== undefined) spans.push({ at: step.at, start, end: row });
      continue;
    }
    row++;
  }
  for (const [at, stack] of open) for (const start of stack) spans.push({ at, start, end: row });
  return spans;
}

function seqHead(head: SeqHead, idPrefix: string, arrowId: string): string | undefined {
  if (head === 'none') return undefined;
  if (head === 'cross') return `url(#${idPrefix}-cross)`;
  if (head === 'async') return `url(#${idPrefix}-async)`;
  return `url(#${arrowId})`;
}

/** `autonumber` 를 켰으면 라벨 앞에 순번을 붙인다. */
function numbered(s: { label: string; num?: number }): string {
  return s.num === undefined ? s.label : `${s.num}. ${s.label}`;
}

export function drawSequence(model: SeqModel, theme: Theme, idPrefix: string, label: string): string {
  const m = metrics(theme);
  const loopW = Math.round(theme.fontSize * 10 / 3);
  const lay = layoutSequence(model, theme);
  const arrowId = `${idPrefix}-arrow`;

  // 실제로 그려질 모든 것(생명선 + 메시지 선/라벨 + 자기 루프 + 노트
  // 상자/라벨 + 참가자 상자/이름)을 모아 콘텐츠 bbox 를 구한다 —
  // layoutSequence 의 width/height 는 열 너비만 잰 값이라, 자기 루프의
  // 오른쪽 여백이나 열보다 넓은 라벨·노트가 그 밖으로 나가면 그대로 잘린다.
  const bbox = new ContentBBox({ minX: 0, minY: 0, maxX: lay.width, maxY: lay.height });

  for (const a of model.actors) {
    const cx = lay.x.get(a)!;
    bbox.box({ minX: cx, maxX: cx, minY: lay.headH, maxY: lay.height - m.memberInset });
  }
  const rows = visibleSteps(model);
  rows.forEach((s, i) => {
    const y = lay.rowY[i]!;
    if (s.t === 'note') {
      const cx = lay.x.get(s.at)!;
      const w = measureText(s.label, theme.labelSize) + m.padX + Math.round(theme.fontSize / 2);
      bbox.box({ minX: cx - w / 2, maxX: cx + w / 2, minY: y - m.memberBaseline, maxY: y + Math.round(theme.fontSize * 5 / 6) });
      return;
    }
    if (s.from === s.to) {
      const cx = lay.x.get(s.from)!;
      bbox.box({ minX: cx, maxX: cx + loopW, minY: y, maxY: y + m.loopH });
      bbox.box(edgeLabel(numbered(s), cx + loopW / 2, y, theme).box);
      return;
    }
    const x1 = lay.x.get(s.from)!, x2 = lay.x.get(s.to)!;
    bbox.box({ minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minY: y, maxY: y });
    bbox.box(edgeLabel(numbered(s), (x1 + x2) / 2, y, theme).box);
  });
  for (const a of model.actors) {
    const cx = lay.x.get(a)!;
    const w = measureText(a, theme.fontSize) + m.padX * 2;
    bbox.box({ minX: cx - w / 2, maxX: cx + w / 2, minY: 0, maxY: lay.headH - m.memberInset });
  }

  const sx = (n: number) => n + bbox.dx;
  const sy = (n: number) => n + bbox.dy;

  const usedHeads = new Set(rows.flatMap((s) => (s.t === 'msg' ? [s.head] : [])));
  const body: string[] = [];
  if (usedHeads.has('arrow')) body.push(arrowMarker(arrowId, theme.line));
  if (usedHeads.has('cross')) body.push(crossMarker(`${idPrefix}-cross`, theme.line));
  if (usedHeads.has('async')) body.push(asyncMarker(`${idPrefix}-async`, theme.line));
  // 메시지·자기 루프 라벨은 참가자 상자보다 나중에 낸다 — 참가자 상자가
  // 라벨을 덮어 가리는 걸 막는다(참가자 상자는 지금도 맨 마지막에 그려져
  // 생명선을 덮는데, 라벨이 그보다 먼저 그려지면 라벨이 상자 밑에 깔린다).
  const labelBody: string[] = [];

  // 생명선 먼저 — 메시지가 그 위에 얹히고, 참가자 상자가 맨 위를 덮는다. faint 로
  // 낮춰(구분선 역할) 메시지·참가자 상자보다 한 단 죽인다.
  for (const a of model.actors) {
    const p1 = snapPoint({ x: sx(lay.x.get(a)!), y: sy(lay.headH) });
    const p2 = snapPoint({ x: sx(lay.x.get(a)!), y: sy(lay.height - 8) });
    body.push(el('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: theme.lineFaint, 'stroke-width': 1, 'stroke-dasharray': '4 4',
    }));
  }

  // 활성 구간 상자 — 생명선 위, 메시지 아래. 생명선을 덮어 "이 동안 이 참가자가
  // 일하고 있다" 를 나타낸다. bbox 에 안 싣는 이유: 폭은 생명선 중심 ±4px 이고
  // 세로는 첫 행과 마지막 행 사이라, 이미 잰 생명선 범위 안에 항상 들어간다
  // (아래 검사가 넘침 0 을 확인한다).
  if (rows.length > 0) {
    const half = Math.round(m.seqRowH / 3);
    const barW = Math.max(6, Math.round(theme.fontSize / 2));
    for (const span of activationSpans(model)) {
      const cx = lay.x.get(span.at);
      if (cx === undefined) continue;
      const startY = lay.rowY[Math.min(span.start, rows.length - 1)]!;
      const endY = lay.rowY[Math.min(Math.max(span.end - 1, span.start), rows.length - 1)]!;
      const box = snapBox({ x: sx(cx) - barW / 2, y: sy(startY) - half, w: barW, h: (endY - startY) + half * 2 });
      body.push(el('rect', {
        x: box.x, y: box.y, width: box.w, height: box.h, rx: 2,
        fill: theme.nodeFillStrong, stroke: theme.nodeBorder, 'stroke-width': 1,
      }));
    }
  }

  rows.forEach((s, i) => {
    const y = sy(lay.rowY[i]!);
    if (s.t === 'note') {
      const cx = sx(lay.x.get(s.at)!);
      const w = measureText(s.label, theme.labelSize) + m.padX + Math.round(theme.fontSize / 2);
      const box = snapBox({ x: cx - w / 2, y: y - 14, w, h: 24 });
      body.push(el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 3, fill: 'none', stroke: theme.nodeBorder, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      body.push(text(s.label, { x: cx, y: y + 2, 'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.labelSize }));
      return;
    }
    if (s.from === s.to) {
      const cx = sx(lay.x.get(s.from)!);
      // 자기 메시지 루프도 간선이다 — 다른 간선과 같은 색·굵기로.
      const pts = [
        { x: cx, y }, { x: cx + loopW, y }, { x: cx + loopW, y: y + m.loopH }, { x: cx, y: y + m.loopH },
      ].map(snapPoint);
      body.push(el('path', {
        d: pathData(pts),
        fill: 'none', stroke: theme.line, 'stroke-width': 1,
        'stroke-dasharray': s.line === 'dotted' ? '3 3' : undefined,
        'marker-end': seqHead(s.head, idPrefix, arrowId),
      }));
      labelBody.push(...edgeLabel(numbered(s), cx + loopW / 2, y, theme).body);
      return;
    }
    const p1 = snapPoint({ x: sx(lay.x.get(s.from)!), y });
    const p2 = snapPoint({ x: sx(lay.x.get(s.to)!), y });
    body.push(el('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: theme.line, 'stroke-width': 1,
      'stroke-dasharray': s.line === 'dotted' ? '3 3' : undefined,
      'marker-end': seqHead(s.head, idPrefix, arrowId),
    }));
    labelBody.push(...edgeLabel(numbered(s), (p1.x + p2.x) / 2, y, theme).body);
  });

  // 참가자 상자를 마지막에 — 생명선 위를 덮는다. 노드 채움을 줘 배경에서 뜨게 한다.
  for (const a of model.actors) {
    const cx = sx(lay.x.get(a)!);
    const w = measureText(a, theme.fontSize) + m.padX * 2;
    const box = snapBox({ x: cx - w / 2, y: sy(0), w, h: lay.headH - 8 });
    body.push(el('rect', {
      x: box.x, y: box.y, width: box.w, height: box.h, rx: theme.radius,
      fill: theme.nodeFillAlt, stroke: theme.nodeBorder, 'stroke-width': 1,
    }));
    body.push(text(a, {
      x: cx, y: sy((lay.headH - m.memberInset) / 2 + theme.fontSize / 3),
      'text-anchor': 'middle', fill: theme.ink, 'font-size': theme.fontSize, 'font-weight': WEIGHT.label,
    }));
  }

  body.push(...labelBody);

  return svgRoot({ width: bbox.width, height: bbox.height, label, body, pad: m.outerPad });
}
