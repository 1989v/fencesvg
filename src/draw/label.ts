import { el, text, type Pt } from '../svg';
import { measureText } from '../text';
import { WEIGHT, type Theme } from './theme';
import type { Box } from './bbox';

// 선에서 라벨까지 띄우는 값·칩 패딩 — class 의 왼쪽 정렬 칩(가로로 띄운다)도
// 같은 숫자를 쓴다. 값이 두 곳에서 각자 하드코딩되어 어긋나는 걸 막는다.
export const GAP = 8;
export const PAD_X = 5;
export const PAD_Y = 3;

/**
 * 폴리라인을 따라 전체 길이의 `t`(0~1) 지점 좌표를 구한다 — 간선 라벨을
 * 중점(0.5) 대신 35% 지점에 두는 데 쓴다. 한 노드에서 갈라져 나가는 두
 * 간선은 시작점 근처에서 거의 겹치지만 갈라지는 방향을 따라 빠르게
 * 벌어지므로, 중점보다 시작 쪽에 가까운 지점이 두 라벨을 확실히 떼어
 * 놓는다 — 그대로 두면 예를 들어 같은 판단 노드에서 나가는 "실패"/"거절"
 * 라벨이 겹쳐 보인다. 드로어마다 따로 걷지 않도록 여기 한 곳에 모은다.
 */
export function pointAtFraction(path: Pt[], t: number): Pt {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return path[0]!;
  const segLens = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
  const total = segLens.reduce((a, b) => a + b, 0);
  if (total === 0) return path[0]!;
  let remaining = total * t;
  for (let i = 0; i < segLens.length; i++) {
    const segLen = segLens[i]!;
    const isLast = i === segLens.length - 1;
    if (remaining <= segLen || isLast) {
      const frac = segLen === 0 ? 0 : Math.min(1, Math.max(0, remaining / segLen));
      const a = path[i]!, b = path[i + 1]!;
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    }
    remaining -= segLen;
  }
  return path[path.length - 1]!;
}

/**
 * 간선 라벨을 배경 칩과 함께 낸다 — 라벨이 선 위에 얹혀 안 읽히는 걸 막는다.
 * `lineY` 는 라벨이 붙는 선의 y 좌표(라벨은 그 위 `GAP`px 에 놓인다),
 * `x` 는 `anchor` 기준점이다(가운데 정렬이면 중심, 왼쪽 정렬이면 시작점).
 * 색은 `theme.label`/`theme.labelChip` — 둘 다 CSS 커스텀 프로퍼티라 소비
 * 사이트가 자기 톤으로 다시 칠할 수 있다.
 *
 * flowchart·state·er 의 간선 라벨과 sequence 의 메시지·자기 루프 라벨이
 * 전부 이 모양(가운데 정렬 칩)을 쓴다 — 한 곳에 모아 반경·패딩이 다섯 군데에서
 * 어긋나지 않게 한다. class 의 관계 라벨은 세로선 옆에 붙는 왼쪽 정렬 칩이라
 * 띄우는 축이 달라(가로 gap) `anchor: 'start'` 로 받는다.
 */
export function edgeLabel(
  label: string,
  x: number,
  lineY: number,
  theme: Theme,
  anchor: 'middle' | 'start' = 'middle',
): { body: string[]; box: Box } {
  const fontSize = theme.labelSize;
  const baseline = lineY - GAP;
  const w = measureText(label, fontSize);
  const minX = anchor === 'middle' ? x - w / 2 - PAD_X : x - PAD_X;
  const maxX = anchor === 'middle' ? x + w / 2 + PAD_X : x + w + PAD_X;
  const top = baseline - fontSize * 0.8 - PAD_Y;
  const bottom = baseline + fontSize * 0.25 + PAD_Y;
  const box: Box = { minX, maxX, minY: top, maxY: bottom };
  const body = [
    el('rect', { x: minX, y: top, width: maxX - minX, height: bottom - top, rx: 3, fill: theme.labelChip }),
    text(label, {
      x, y: baseline, 'text-anchor': anchor, fill: theme.label,
      'font-size': fontSize, 'font-weight': WEIGHT.edgeLabel,
    }),
  ];
  return { body, box };
}
