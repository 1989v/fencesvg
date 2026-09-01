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
  accentStrokeWidth: number; // 강조 노드 테두리 굵기 — 색으로 못 가르는 경로(EDITORIAL)에서 굵기로 가른다
  accentWeight: number;      // 강조 노드 라벨 굵기 — 위와 같은 이유
};

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
export const MUTED_OPACITY = 0.58;
export const FAINT_OPACITY = 0.16;

/**
 * 기본값 — 무채색 편집 톤(monochrome editorial). 위계는 색상이 아니라 굵기·
 * 명도에서만 나온다: 브랜드 색을 모르는 채로 하나 지어내면 소비 사이트의
 * 색과 부딪힌다. 전부 `currentColor` 에서 파생돼 사이트가 밝든 어둡든
 * 안다는 전제 없이 맞는다.
 *
 * `line`/`nodeBorder`/`nodeFill`/`labelChip`/`accentFill`/`label` 은 그리는
 * 쪽에서 추가 불투명도를 안 걸므로(각 draw/*.ts 확인 완료) `color-mix()` 로
 * 알파를 직접 값에 굽는다. 반대로 `muted`/`lineFaint` 는 이미
 * MUTED_OPACITY/FAINT_OPACITY 를 별도 `*-opacity` 속성으로 곱해 쓰므로,
 * 여기서 또 섞으면 두 번 옅어진다 — `currentColor` 그대로 둔다.
 *
 * 강조는 색으로 못 가르니(accent 도 currentColor) 굵기로 가른다 — 테두리
 * 1.75(평소 1), 라벨 700(평소 600). 실제 색상 강조가 있는 경로(`detectTheme`
 * 이 링크 색을 찾았거나, 호출자가 accent 를 명시)에서는 평소 굵기(1.25/600)
 * 로 되돌아간다 — `defaultTheme(accent)` 참고.
 */
export const EDITORIAL: Theme = {
  ink: 'var(--fs-ink, currentColor)',
  muted: 'var(--fs-muted, currentColor)',
  line: 'var(--fs-line, color-mix(in srgb, currentColor 30%, transparent))',
  lineFaint: 'var(--fs-line-faint, currentColor)',
  nodeFill: 'var(--fs-node-fill, color-mix(in srgb, currentColor 3.5%, transparent))',
  nodeBorder: 'var(--fs-node-border, color-mix(in srgb, currentColor 30%, transparent))',
  accent: 'var(--fs-accent, currentColor)',
  accentFill: 'var(--fs-accent-fill, color-mix(in srgb, currentColor 9%, transparent))',
  label: 'var(--fs-label, color-mix(in srgb, currentColor 58%, transparent))',
  labelChip: 'var(--fs-label-chip, color-mix(in srgb, currentColor 6%, transparent))',
  radius: 'var(--fs-radius, 6)',
  fontSize: 12,
  labelSize: 9,
  pad: 14,
  accentStrokeWidth: 1.75,
  accentWeight: 700,
};

/**
 * `accent` 를 안 주면(또는 `currentColor` 를 그대로 주면) `EDITORIAL` 을
 * 그대로 돌려준다 — 색 위계를 굳이 다시 만들지 않는다. 실제 색(`accent`)을
 * 주면 강조만 그 색으로 바꾸고, 강조가 이제 색으로 구별되니 굵기 과장
 * (1.75/700)을 평소 값(1.25/`WEIGHT.label`)으로 되돌린다 — 색과 굵기를
 * 동시에 과장하면 오히려 산만하다. 나머지 역할(잉크·구조·바탕…)은 사이트
 * 브랜드와 무관한 무채색 위계라 `accent` 유무와 상관없이 그대로 둔다.
 */
export function defaultTheme(accent = 'currentColor'): Theme {
  if (accent === 'currentColor') return EDITORIAL;
  return {
    ...EDITORIAL,
    accent: `var(--fs-accent, ${accent})`,
    accentFill: `var(--fs-accent-fill, color-mix(in srgb, ${accent} 10%, transparent))`,
    accentStrokeWidth: 1.25,
    accentWeight: WEIGHT.label,
  };
}
