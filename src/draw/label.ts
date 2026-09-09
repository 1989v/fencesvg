import { el, text, type Pt } from '../svg';
import { measureText, extraLineHeight } from '../text';
import { WEIGHT, type Theme } from './theme';
import type { Box } from './bbox';
import { fanRoom, segmentInsideSpan } from '../layout/edge';

// 선에서 라벨까지 띄우는 값·칩 패딩 — class 의 왼쪽 정렬 칩(가로로 띄운다)도
// 같은 숫자를 쓴다. 값이 두 곳에서 각자 하드코딩되어 어긋나는 걸 막는다.
export const GAP = 8;
export const PAD_X = 5;
export const PAD_Y = 3;

/**
 * 라벨이 선에 어떻게 붙는가.
 * - `on`: 선 **위에** 앉는다 — 칩 중심이 선 위에 오고, 그리는 쪽이 칩 자리에서
 *   선을 끊는다(`cutPathAtBox`). 흐름도·상태도·ER 의 간선 라벨. 라벨이 어느
 *   선의 것인지가 자리로 드러난다 — 선 옆에 띄우면 근처의 다른 선 것으로 읽힌다.
 * - `above`: 선 `GAP`px 위에 뜬다. 순차도의 메시지 라벨 — 가로선 위에 글을
 *   얹는 것이 순차도의 관례고, 선을 끊으면 메시지 방향이 안 보인다.
 */
export type LabelMode = 'on' | 'above';

/** `on` 모드에서 글자 기준선을 선 아래로 내리는 비율 — 대문자 높이(약 0.7em)의
 * 절반쯤 내려야 글자의 시각적 중심이 선 위에 온다. */
const ON_LINE_BASELINE = 0.3;

function baselineFor(lineY: number, fontSize: number, mode: LabelMode): number {
  return mode === 'above' ? lineY - GAP : lineY + fontSize * ON_LINE_BASELINE;
}

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
  mode: LabelMode = 'on',
): Box {
  const fontSize = theme.labelSize;
  const baseline = baselineFor(lineY, fontSize, mode);
  const w = measureText(label, fontSize);
  // 여러 줄이면 첫 줄이 위로, 마지막 줄이 아래로 반씩 벌어진다(`text()` 의 정렬).
  const half = extraLineHeight(label, fontSize) / 2;
  return {
    minX: anchor === 'middle' ? x - w / 2 - PAD_X : x - PAD_X,
    maxX: anchor === 'middle' ? x + w / 2 + PAD_X : x + w + PAD_X,
    minY: baseline - fontSize * 0.8 - PAD_Y - half,
    maxY: baseline + fontSize * 0.25 + PAD_Y + half,
  };
}

/** 라벨을 놓아 볼 지점의 비율. 0.4 가 1순위인 이유는 위 `pointAtFraction`
 * 주석에 있다 — 한 노드에서 갈라지는 두 간선의 라벨을 떼어 놓는 값이다.
 * 나머지는 그 자리가 막혔을 때 가까운 순으로 옮겨 볼 자리다. */
const LABEL_FRACTIONS = [0.4, 0.5, 0.32, 0.6, 0.25, 0.7, 0.18, 0.8];

/** 칩 양옆(위아래)으로 선이 보여야 하는 최소 길이 — 끊긴 선이 라벨을 "지나는" 것으로 읽히게. */
const LABEL_ROOM = 24;

/**
 * 라벨이 선 위에 앉으려면 두 상자 사이가 이만큼은 되어야 한다 — 가로 흐름이면
 * 칩 폭, 세로 흐름이면 칩 높이에 양옆 선 길이를 더한 값. `layoutGraph` 의
 * `need` 로 넘겨 그 층 사이만 벌린다.
 */
export function labelRoom(label: string, theme: Theme, axis: 'x' | 'y'): number {
  const b = labelChipBox(label, 0, 0, theme);
  return (axis === 'x' ? b.maxX - b.minX : b.maxY - b.minY) + LABEL_ROOM;
}

/**
 * `layoutGraph` 의 `need` — 라벨 있는 간선이 두 층 사이에서 필요로 하는 길이.
 * 부채꼴(`planPorts`)에 속한 간선은 꺾는 지점이 출발·도착 가까이에 몰려 그만큼을
 * 더 먹으므로(실측: 24px 를 먹어 44px 칩이 남은 44px 구간을 꽉 채우고 상자에
 * 닿았다) 부채꼴 크기만큼 더한다.
 */
export function edgeRoom<E extends { from: string; to: string; label?: string }>(
  edges: E[], theme: Theme, axis: 'x' | 'y',
): (e: E) => number {
  const outdeg = new Map<string, number>();
  const indeg = new Map<string, number>();
  for (const e of edges) {
    outdeg.set(e.from, (outdeg.get(e.from) ?? 0) + 1);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  return (e) => (e.label
    ? labelRoom(e.label, theme, axis) + fanRoom(Math.max(outdeg.get(e.from) ?? 1, indeg.get(e.to) ?? 1))
    : 0);
}

/**
 * `layoutGraph` 의 `stackNeed` — 세로 흐름(TD/BT)에서 라벨 있는 간선 하나가 띠 안에서
 * 차지하는 높이. 가로 글자 칩은 같은 띠에 여럿이면 위아래로 쌓여야 한다.
 */
export function labelStack<E extends { label?: string }>(theme: Theme, axis: 'x' | 'y'): (e: E) => number {
  return (e) => (axis === 'y' && e.label ? labelRoom(e.label, theme, 'y') - LABEL_ROOM + 8 : 0);
}

/** 선을 끊을 때 칩 둘레에 두는 여유 — `cutPathAtBox` 의 기본값과 같다. */
export const CUT_MARGIN = 2;

/** 비율 `t` 지점이 놓인 선분의 길이와 방향. */
function segmentAt(path: Pt[], t: number): { len: number; horizontal: boolean } {
  const segLens = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
  const total = segLens.reduce((a, b) => a + b, 0);
  let remaining = total * t;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]!;
    if (remaining <= len || i === segLens.length - 1) {
      return { len, horizontal: Math.abs(path[i + 1]!.y - path[i]!.y) < 0.5 };
    }
    remaining -= len;
  }
  return { len: 0, horizontal: true };
}

/**
 * 라벨을 놓아 볼 지점들 — **가로 구간의 중점**을 긴 것부터 먼저, 그 다음 위
 * 비율들. 글자는 가로로 놓이므로 가로 구간에 앉은 라벨이 그 선의 것으로
 * 읽히고, 세로 토막에 얹으면 옆 선의 라벨과 뒤섞인다(실측: 부채꼴의 안쪽
 * 간선 라벨이 출발 직후의 짧은 세로 토막에 얹혀 이웃 선을 덮었다).
 */
function labelCandidates(path: Pt[]): number[] {
  const segLens = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
  const total = segLens.reduce((a, b) => a + b, 0);
  if (total === 0) return LABEL_FRACTIONS;
  const horizontal: { t: number; len: number }[] = [];
  const vertical: { t: number; len: number }[] = [];
  let before = 0;
  segLens.forEach((len, i) => {
    if (len > 0) (Math.abs(path[i + 1]!.y - path[i]!.y) < 0.5 ? horizontal : vertical).push({ t: (before + len / 2) / total, len });
    before += len;
  });
  horizontal.sort((a, b) => b.len - a.len);
  vertical.sort((a, b) => b.len - a.len);
  // 세로 구간의 중점도 후보에 넣는다 — 짧은 첫·끝 세로 토막(전체의 15% 미만)은
  // 비율 후보가 한 번도 안 닿아, 가로가 막힌 라벨이 갈 곳 없이 겹쳤다(실측).
  return [...horizontal.map((h) => h.t), ...vertical.map((v) => v.t), ...LABEL_FRACTIONS];
}

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
  mode: LabelMode = 'on',
): number {
  const obstacles = [...nodes.map(asBox), ...placed];
  const candidates = labelCandidates(path);
  let leastT = candidates[0]!;
  let leastArea = Infinity;
  for (const t of candidates) {
    const at = pointAtFraction(path, t);
    const chip = labelChipBox(label, at.x, at.y, theme, 'middle', mode);
    let area = 0;
    for (const o of obstacles) area += overlapArea(chip, o);
    // 칩이 자기 선분보다 길면 꺾이는 모서리까지 덮어 선이 사라진다 — 안 맞는
    // 만큼 벌점을 준다(실측: 부채꼴 안쪽 간선의 44px 구간에 44px 칩이 앉아
    // 도착 직전 선이 통째로 잘렸다).
    if (mode === 'on') {
      const seg = segmentAt(path, t);
      const fit = (seg.horizontal ? chip.maxX - chip.minX : chip.maxY - chip.minY) + 2 * CUT_MARGIN + 4;
      if (seg.len < fit) area += (fit - seg.len) * (chip.maxY - chip.minY);
    }
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
  mode: LabelMode = 'on',
): { body: string[]; box: Box } {
  const fontSize = theme.labelSize;
  const baseline = baselineFor(lineY, fontSize, mode);
  const box = labelChipBox(label, x, lineY, theme, anchor, mode);
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

/**
 * 폴리라인에서 상자(라벨 칩) 안을 지나는 구간을 잘라 내고 바깥 조각들을 돌려준다.
 *
 * 간선 라벨이 선 위에 앉을 때(`LabelMode` `on`) 선이 글자 밑을 지나지 않게 하는
 * 데 쓴다. 칩을 불투명하게 칠해 가리는 대신 선 자체를 끊으면 칩이 반투명한
 * 테마(EDITORIAL)에서도 읽히고, 사이트가 `--fs-label-chip` 을 어떻게 주든
 * 상관없다. 상자와 안 만나면 원래 경로 하나가 그대로 온다. 점 하나뿐인 조각은
 * 버린다 — 그릴 것이 없다.
 */
export function cutPathAtBox(path: Pt[], box: Box, margin = 2): Pt[][] {
  const b: Box = { minX: box.minX - margin, maxX: box.maxX + margin, minY: box.minY - margin, maxY: box.maxY + margin };
  const pieces: Pt[][] = [];
  let cur: Pt[] = [];
  const close = () => { if (cur.length >= 2) pieces.push(cur); cur = []; };
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i]!, q = path[i + 1]!;
    const span = segmentInsideSpan(p, q, b);
    if (!span) { if (cur.length === 0) cur.push(p); cur.push(q); continue; }
    const [t0, t1] = span;
    const at = (t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    if (t0 > 0) { if (cur.length === 0) cur.push(p); cur.push(at(t0)); }
    close();
    if (t1 < 1) { cur.push(at(t1)); cur.push(q); }
  }
  close();
  return pieces.length ? pieces : [path];
}
