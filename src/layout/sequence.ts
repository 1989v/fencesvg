import type { SeqModel, SeqStep } from '../parse/sequence';
import type { Theme } from '../draw/theme';
import { measureText } from '../text';

/**
 * 행을 차지하는 단계만.
 *
 * activate/deactivate 는 생명선 위의 상자라 행이 없다. 프레임을 여는 줄과
 * 갈래(`else`)는 이름표가 한 줄을 차지하니 행이 있고, 닫는 줄은 없다.
 */
export type RowStep = Extract<SeqStep, { t: 'msg' | 'note' | 'frameOpen' | 'frameElse' }>;
export function visibleSteps(model: SeqModel): RowStep[] {
  return model.steps.filter((s): s is RowStep =>
    s.t === 'msg' || s.t === 'note' || s.t === 'frameOpen' || s.t === 'frameElse');
}
import { metrics } from '../draw/theme';


/**
 * 그래프 배치가 없다. 참가자는 선언 순서대로 열, 단계는 순서대로 행이다.
 * 열 너비는 그 열을 지나는 가장 긴 메시지 라벨/노트가 정한다.
 *
 * 메시지 두 끝(`from`·`to`) 각각의 열 폭을 라벨이 필요로 하는 폭(`need`)
 * **그대로** 최소값으로 싣는다. 두 열의 중심 간 거리는 최소
 * `wFrom/2 + wTo/2 ≥ need/2 + need/2 = need` 라 사이에 다른 열이 없어도
 * (인접한 두 참가자) 항상 `need` 이상이다. 사이에 다른 참가자를 건너뛰는
 * 메시지(예: A→C, B 를 건너뜀)는 중간 열(B) 폭만큼 거리가 더 벌어지니
 * 이 하한은 초과분일 뿐 절대 부족해지지 않는다 — 처음엔 `need / span` 으로
 * 건너뛴 열 개수만큼 나눴었는데, 중간 열이 `MIN_COL` 그대로면 두 중심
 * 사이 거리가 `need` 에 못 미쳐 라벨이 옆 생명선과 겹쳤다(실측:
 * 필요 215.4px 인데 실제 거리 203.7px). 나눗셈을 없애 그 부족을 없앴다.
 */
export function layoutSequence(model: SeqModel, theme: Theme) {
  const m = metrics(theme);
  const HEAD_H = m.seqHeadH, ROW_H = m.seqRowH, TOP_GAP = m.seqTopGap, MIN_COL = m.seqMinCol;
  // 열 너비에 노드 간격을 더한다. 안 더하면 열 폭이 곧 상자 폭이라 이웃한
  // 두 상자가 맞닿는다 — 실측에서 참가자 상자 사이가 8px 까지 좁아졌다.
  // 열 폭에 간격을 실어 두면 두 중심 사이 거리가 (b1+b2)/2 + gap 이 되어
  // 테두리 사이가 정확히 gap 만큼 벌어진다.
  const widest = new Map<string, number>(
    model.actors.map((a) => [a, measureText(a, theme.fontSize) + m.padX * 2 + m.gap.node]),
  );
  for (const s of visibleSteps(model)) {
    if (s.t === 'note') {
      const need = measureText(s.label, theme.labelSize) + m.padX + Math.round(theme.fontSize / 2);
      widest.set(s.at, Math.max(widest.get(s.at) ?? MIN_COL, need));
      continue;
    }
    // 프레임 이름표는 열 폭을 밀지 않는다 — 테두리 안 왼쪽 위에 앉으므로
    // 어느 한 열에 속하지 않는다.
    if (s.t !== 'msg') continue;
    const need = measureText(s.label, theme.labelSize) + theme.fontSize * 2;
    for (const a of [s.from, s.to]) widest.set(a, Math.max(widest.get(a) ?? MIN_COL, need));
  }

  const x = new Map<string, number>();
  let cursor = 0;
  for (const a of model.actors) {
    const w = Math.max(MIN_COL, widest.get(a) ?? MIN_COL);
    x.set(a, cursor + w / 2);
    cursor += w;
  }

  const rows = visibleSteps(model).length;
  const rowY = Array.from({ length: rows }, (_, i) => HEAD_H + TOP_GAP + i * ROW_H);
  const height = HEAD_H + TOP_GAP + rows * ROW_H + theme.fontSize;
  return { x, rowY, width: cursor, height, headH: HEAD_H };
}
