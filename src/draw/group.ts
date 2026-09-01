import { el, text, type Pt } from '../svg';
import { measureText } from '../text';
import { WEIGHT, MUTED_OPACITY, metrics, type Theme } from './theme';
import type { Group } from '../parse/types';
import type { Placed } from '../layout/graph';
import type { Box } from './bbox';

export type Frame = { box: Box; label: string };

/**
 * 그룹 테두리를 계산한다.
 *
 * 테두리는 구성원의 경계 상자다. 그래서 구성원이 흩어져 있으면 그 안에 남의
 * 노드가 들어가고, 그건 "이 노드도 이 그룹이다" 라는 **틀린 말**이 된다.
 * 배치 쪽에서 같은 그룹을 붙여 놓지만 보장은 아니므로, 여기서 실제로 남의
 * 노드가 들어갔는지 보고 들어갔으면 그 테두리는 그리지 않는다 — 대신
 * 경고를 남긴다. 잘못된 그림보다 없는 그림이 낫다.
 */
export function framesFor(
  groups: Group[],
  placed: Map<string, Placed>,
  theme: Theme,
): { frames: Frame[]; warnings: string[] } {
  const m = metrics(theme);
  const pad = m.padY;
  const frames: Frame[] = [];
  const warnings: string[] = [];

  for (const g of groups) {
    const members = g.members.map((id) => placed.get(id)).filter((p): p is Placed => p !== undefined);
    if (members.length === 0) continue;

    const box: Box = {
      minX: Math.min(...members.map((p) => p.x)) - pad,
      maxX: Math.max(...members.map((p) => p.x + p.w)) + pad,
      // 라벨이 테두리 위쪽 안에 앉는다 — 그만큼 위를 더 연다.
      minY: Math.min(...members.map((p) => p.y)) - pad - m.rowH,
      maxY: Math.max(...members.map((p) => p.y + p.h)) + pad,
    };

    const memberIds = new Set(g.members);
    const intruders = [...placed.values()]
      .filter((p) => !memberIds.has(p.id))
      .filter((p) => p.x + p.w > box.minX && p.x < box.maxX && p.y + p.h > box.minY && p.y < box.maxY)
      .map((p) => p.id);

    if (intruders.length > 0) {
      warnings.push(`'${g.label}' 테두리 안에 다른 노드(${intruders.join(', ')})가 들어가 테두리를 그리지 않는다`);
      continue;
    }
    frames.push({ box, label: g.label });
  }
  return { frames, warnings };
}

/** 테두리를 그린다. 노드보다 **먼저** 내야 노드가 위에 온다. */
export function drawFrames(frames: Frame[], shift: (p: Pt) => Pt, theme: Theme): string[] {
  const m = metrics(theme);
  const body: string[] = [];
  for (const f of frames) {
    const a = shift({ x: f.box.minX, y: f.box.minY });
    const b = shift({ x: f.box.maxX, y: f.box.maxY });
    body.push(el('rect', {
      x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, rx: theme.radius,
      fill: 'none', stroke: theme.lineFaint, 'stroke-width': 1, 'stroke-dasharray': '5 4',
    }));
    body.push(text(f.label, {
      x: a.x + m.memberInset, y: a.y + m.rowH,
      fill: theme.muted, 'fill-opacity': MUTED_OPACITY,
      'font-size': m.memberSize, 'font-weight': WEIGHT.label,
    }));
  }
  return body;
}

/** 라벨이 테두리보다 길면 테두리를 넓힌다 — 글자가 밖으로 새는 걸 막는다. */
export function widenForLabel(f: Frame, theme: Theme): Frame {
  const m = metrics(theme);
  const need = m.memberInset * 2 + measureText(f.label, m.memberSize);
  const have = f.box.maxX - f.box.minX;
  if (need <= have) return f;
  return { ...f, box: { ...f.box, maxX: f.box.minX + need } };
}
