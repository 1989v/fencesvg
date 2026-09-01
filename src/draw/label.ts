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
export function labelChipBox(
  label: string,
  x: number,
  lineY: number,
  theme: Theme,
  anchor: 'middle' | 'start' = 'middle',
): Box {
  const fontSize = theme.labelSize;
  const baseline = lineY - GAP;
  const w = measureText(label, fontSize);
  return {
    minX: anchor === 'middle' ? x - w / 2 - PAD_X : x - PAD_X,
    maxX: anchor === 'middle' ? x + w / 2 + PAD_X : x + w + PAD_X,
    minY: baseline - fontSize * 0.8 - PAD_Y,
    maxY: baseline + fontSize * 0.25 + PAD_Y,
  };
}

/** 라벨을 놓아 볼 지점의 비율. 0.4 가 1순위인 이유는 위 `pointAtFraction`
 * 주석에 있다 — 한 노드에서 갈라지는 두 간선의 라벨을 떼어 놓는 값이다.
 * 나머지는 그 자리가 막혔을 때 가까운 순으로 옮겨 볼 자리다. */
const LABEL_FRACTIONS = [0.4, 0.5, 0.32, 0.6, 0.25, 0.7, 0.18, 0.8];

/** 사각형 두 개가 겹치는 넓이. 안 겹치면 0 — 맞닿기만 한 것도 0 이다. */
function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

export type NodeRect = { x: number; y: number; w: number; h: number };

function asBox(n: NodeRect): Box {
  return { minX: n.x, maxX: n.x + n.w, minY: n.y, maxY: n.y + n.h };
}

/**
 * 라벨 칩이 노드도 다른 라벨도 덮지 않는 지점의 비율을 고른다.
 *
 * 라벨은 노드보다 나중에 그려 선 위로 올라오는데, 그 자리가 노드 위면
 * 노드 이름을 대신 가린다 — 실측에서 ER 의 `owns` 칩이 `ORDER` 를 통째로
 * 덮어 엔티티 이름을 읽을 수 없었다.
 *
 * 노드만 피하게 하면 이번에는 라벨끼리 겹친다(실제로 그렇게 만들었다가
 * 기존 테스트가 잡았다). 그래서 이미 자리를 잡은 라벨도 같이 피한다 —
 * 호출하는 쪽이 고른 칩을 `placed` 에 쌓아 넘긴다.
 *
 * 후보 지점을 순서대로 넣어 보고 처음으로 안 겹치는 자리를 쓴다. 전부
 * 막히면 **겹치는 넓이가 가장 작은** 자리를 쓴다 — 1순위로 돌려보내면
 * 막힌 라벨끼리 같은 자리에 쌓인다(실제로 그렇게 만들었다가 순환이 많은
 * 흐름도에서 두 라벨이 2.5px 차이로 겹쳤다). 어딘가에는 놓아야 하고,
 * 라벨이 사라지는 것보다 조금 겹치는 편이 낫다.
 */
export function chooseLabelT(
  path: Pt[],
  label: string,
  theme: Theme,
  nodes: NodeRect[],
  placed: Box[] = [],
): number {
  const obstacles = [...nodes.map(asBox), ...placed];
  let leastT = LABEL_FRACTIONS[0]!;
  let leastArea = Infinity;
  for (const t of LABEL_FRACTIONS) {
    const at = pointAtFraction(path, t);
    const chip = labelChipBox(label, at.x, at.y, theme);
    let area = 0;
    for (const o of obstacles) area += overlapArea(chip, o);
    if (area === 0) return t;
    if (area < leastArea) { leastArea = area; leastT = t; }
  }
  return leastT;
}

export function edgeLabel(
  label: string,
  x: number,
  lineY: number,
  theme: Theme,
  anchor: 'middle' | 'start' = 'middle',
): { body: string[]; box: Box } {
  const fontSize = theme.labelSize;
  const baseline = lineY - GAP;
  const box = labelChipBox(label, x, lineY, theme, anchor);
  const { minX, maxX, minY: top, maxY: bottom } = box;
  const body = [
    el('rect', { x: minX, y: top, width: maxX - minX, height: bottom - top, rx: 3, fill: theme.labelChip }),
    text(label, {
      x, y: baseline, 'text-anchor': anchor, fill: theme.label,
      'font-size': fontSize, 'font-weight': WEIGHT.edgeLabel,
    }),
  ];
  return { body, box };
}
