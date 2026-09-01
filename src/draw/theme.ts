/**
 * 색·굵기·반경을 라이브러리가 정하지 않는다 — 이름만 정하고 값은 CSS 커스텀
 * 프로퍼티로 연다. `var(--fs-…, fallback)` 을 속성에 그대로 낸다: 소비 사이트가
 * 자기 스타일시트에서 `--fs-…` 를 지정하면 그 사이트의 재료를 그대로 물려받고
 * (**CSS 가 이긴다** — `var()` 의 fallback 은 프로퍼티가 안 풀렸을 때만 쓰인다),
 * 아무 CSS 도 안 주면 fallback 이 지금 수준의 보이는 모습을 유지한다.
 *
 * `Theme` 의 각 필드는 그 `var(--fs-…, fallback)` 문자열 자체다 — 드로어는
 * `var()` 문법을 몰라도 되고 그냥 `theme.ink` 를 `fill` 에 꽂으면 된다.
 */
export type Theme = {
  ink: string;         // 노드 라벨, 엔티티·클래스 이름
  muted: string;        // 보조행(멤버·부제) — MUTED_OPACITY 와 함께 쓴다
  line: string;         // 간선, 화살촉, 카디널리티 기호
  lineFaint: string;    // 생명선, 구분선 — FAINT_OPACITY 와 함께 쓴다
  nodeFill: string;     // 노드 채움
  nodeBorder: string;   // 노드 테두리
  accent: string;       // 강조 노드 테두리·라벨
  accentFill: string;   // 강조 노드 채움
  label: string;        // 간선 라벨
  labelChip: string;    // 간선 라벨 뒤 칩
  radius: string;       // 노드 모서리 반경 — rx 에 그대로 꽂는다(단위 없는 숫자만 fallback)
  fontSize: number;     // 노드 라벨
  labelSize: number;    // 간선 라벨
  pad: number;          // 상자 안 여백
};

/**
 * `accent` 를 주면 `--fs-accent` 가 안 풀렸을 때의 fallback 이 된다 — 옵션으로도
 * 되고 CSS 로도 되되 CSS 가 이긴다. 안 주면 `currentColor` 까지 내려간다.
 */
export function defaultTheme(accent = 'currentColor'): Theme {
  return {
    ink: 'var(--fs-ink, currentColor)',
    muted: 'var(--fs-muted, currentColor)',
    line: 'var(--fs-line, currentColor)',
    lineFaint: 'var(--fs-line-faint, currentColor)',
    nodeFill: 'var(--fs-node-fill, transparent)',
    nodeBorder: 'var(--fs-node-border, currentColor)',
    accent: `var(--fs-accent, ${accent})`,
    accentFill: 'var(--fs-accent-fill, transparent)',
    label: 'var(--fs-label, currentColor)',
    labelChip: 'var(--fs-label-chip, transparent)',
    radius: 'var(--fs-radius, 6)',
    fontSize: 12,
    labelSize: 9,
    pad: 14,
  };
}

/**
 * 활자 굵기는 사이트마다 달라지지 않는 타이포 규칙이라 Theme(=CSS 로 여는 값)
 * 에 넣지 않는다.
 */
export const WEIGHT = { label: 600, member: 400, edgeLabel: 500 } as const;

/**
 * `--fs-muted`/`--fs-line-faint` 는 색은 CSS 로 열되, 다른 역할보다 한 단
 * 죽인다는 사실 자체는 라이브러리가 정한다 — 그래서 불투명도는 이름을 열지
 * 않고 고정 상수로 둔다(스펙 표에 없는 값이라 Theme 필드가 아니다).
 */
export const MUTED_OPACITY = 0.62;
export const FAINT_OPACITY = 0.35;
