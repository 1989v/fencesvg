/**
 * 문자 부류별 평균 advance (em 단위).
 * 브라우저에서 재지 않는 이유 — 측정에 기대면 Node 에서 못 돌고,
 * 서버와 브라우저가 다른 크기를 내면 하이드레이션에서 그림이 한 번 튄다.
 */
const EM = {
  cjk: 1.0,      // 한글·한자·가나는 전각 고정폭에 가깝다
  upper: 0.66,
  lower: 0.52,
  digit: 0.55,
  narrow: 0.28,  // 공백·구두점
  other: 0.6,
} as const;

function classOf(cp: number): keyof typeof EM {
  // CJK 통합한자 · 한글 음절 · 한글 자모 · 가나 · 전각 기호
  if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3000 && cp <= 0x30ff) ||
      (cp >= 0x3130 && cp <= 0x318f) || (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xff00 && cp <= 0xff60)) return 'cjk';
  if (cp >= 0x41 && cp <= 0x5a) return 'upper';
  if (cp >= 0x61 && cp <= 0x7a) return 'lower';
  if (cp >= 0x30 && cp <= 0x39) return 'digit';
  if (cp === 0x20 || (cp >= 0x21 && cp <= 0x2f) || (cp >= 0x3a && cp <= 0x40)) return 'narrow';
  return 'other';
}

/** 줄 높이(em). 라벨 안에서 줄을 나눌 때 쓴다. */
export const LINE_HEIGHT = 1.25;

/**
 * 라벨을 줄로 나눈다. mermaid 는 `<br>` 로 줄을 바꾼다 — `<br/>` · `<br />` ·
 * 대소문자도 받고, 실제 개행도 같은 뜻으로 본다.
 */
export function splitLines(text: string): string[] {
  return text.split(/<br\s*\/?>|\n/i).map((l) => l.trim());
}

function measureLine(line: string, fontSize: number): number {
  let em = 0;
  for (const ch of line) em += EM[classOf(ch.codePointAt(0)!)];
  return em * fontSize;
}

/**
 * 라벨의 렌더 폭 추정(px). 상자 크기를 정하는 데만 쓴다 — 픽셀 정확도가 필요하지 않다.
 * 여러 줄이면 **가장 긴 줄**의 폭이다. 호출하는 쪽은 줄 수를 몰라도 된다.
 */
export function measureText(text: string, fontSize: number): number {
  return Math.max(...splitLines(text).map((l) => measureLine(l, fontSize)));
}

/** 여러 줄 라벨이 한 줄보다 더 차지하는 세로 높이(px). 한 줄이면 0. */
export function extraLineHeight(text: string, fontSize: number): number {
  return (splitLines(text).length - 1) * fontSize * LINE_HEIGHT;
}
