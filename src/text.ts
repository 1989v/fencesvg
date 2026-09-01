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

/** 라벨의 렌더 폭 추정(px). 상자 크기를 정하는 데만 쓴다 — 픽셀 정확도가 필요하지 않다. */
export function measureText(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) em += EM[classOf(ch.codePointAt(0)!)];
  return em * fontSize;
}
