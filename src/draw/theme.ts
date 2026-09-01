/**
 * 색은 값이 아니라 **참조**로 낸다. 칠하는 시점에 페이지 CSS 가 풀므로
 * 라이브러리는 사이트 색을 알 필요가 없고, 테마 토글도 그대로 따라간다.
 *
 * hex 를 쓰지 않으므로 역할(간선·채움·보조선…)은 `currentColor`/`accent` 의
 * **불투명도**로 만든다 — `muted`/`faint`/`surface`/`accentTint` 가 그 값이다.
 * 두 테마에서 자동으로 맞고, 쓰는 쪽이 굳이 hex 를 몰라도 되는 이유가 이거다.
 */
export type Theme = {
  ink: string;        // 선·글자
  accent: string;     // 강조 하나
  fontSize: number;   // 노드 라벨 / 엔티티·클래스 이름
  labelSize: number;  // 간선 라벨
  pad: number;        // 상자 안 여백
  muted: number;      // 간선·화살촉·간선 라벨의 불투명도
  faint: number;      // 생명선·보조 구분선의 불투명도
  surface: number;    // 노드 채움의 불투명도
  accentTint: number; // 강조 노드 채움의 불투명도
};

export function defaultTheme(accent = 'var(--accent)'): Theme {
  return {
    ink: 'currentColor',
    accent,
    fontSize: 12,
    labelSize: 9,
    pad: 14,
    muted: 0.55,
    faint: 0.28,
    surface: 0.035,
    accentTint: 0.1,
  };
}

/**
 * 활자 굵기는 사이트마다 달라지지 않는 타이포 규칙이라 Theme 에 넣지 않는다
 * (Theme 는 사이트 색·크기처럼 소비자가 바꿀 값만 담는다).
 */
export const WEIGHT = { label: 600, member: 400, edgeLabel: 500 } as const;
