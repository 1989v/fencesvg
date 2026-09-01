/**
 * 색은 값이 아니라 **참조**로 낸다. 칠하는 시점에 페이지 CSS 가 풀므로
 * 라이브러리는 사이트 색을 알 필요가 없고, 테마 토글도 그대로 따라간다.
 */
export type Theme = {
  ink: string;        // 선·글자
  accent: string;     // 강조 하나
  fontSize: number;   // 노드 라벨
  labelSize: number;  // 간선 라벨
  pad: number;        // 상자 안 여백
};

export function defaultTheme(accent = 'var(--accent)'): Theme {
  return { ink: 'currentColor', accent, fontSize: 13, labelSize: 11, pad: 14 };
}
