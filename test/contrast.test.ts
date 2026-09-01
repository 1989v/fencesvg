// @vitest-environment jsdom
//
// 대비는 **눈에 보이는 색**으로 재야 한다. 사이트에서 읽어 온 테두리 색은
// 그 사이트가 `color-mix(… 12%, transparent)` 로 만든 값일 때가 많은데,
// 알파를 무시하고 재면 "황토(밝기 147) vs 어두운 바탕(19) = 대비 128" 이라
// 통과한다. 실제로 보이는 것은 12% 만 얹힌 색이라 대비가 15 였다.
import { describe, it, expect } from 'vitest';
import { detectTheme } from '../src/auto';

type Rgb = { r: number; g: number; b: number; a: number };

function parse(v: string): Rgb | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i.exec(v);
  if (!m) return null;
  const raw = m[4];
  const a = raw === undefined ? 1 : raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
  return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a };
}
/** `var(--x, 값)` 에서 감지된 값만 꺼낸다. */
const fallback = (v: string) => /var\([^,]+,\s*(.+)\)$/.exec(v)?.[1]?.trim() ?? v;
const lum = (c: Rgb) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
function contrast(color: string, ground: string): number {
  const c = parse(fallback(color)), g = parse(fallback(ground));
  if (!c || !g) throw new Error(`못 읽음: ${color} / ${ground}`);
  const over = { r: c.r * c.a + g.r * (1 - c.a), g: c.g * c.a + g.g * (1 - c.a), b: c.b * c.a + g.b * (1 - c.a), a: 1 };
  return Math.abs(lum(over) - lum(g));
}

describe('감지한 색은 바탕에 얹었을 때 실제로 보인다', () => {
  // 2026-09-02 blog.1989v.com 다크 모드 실측을 그대로 옮긴 것이다. 테두리
  // 요소가 알파 12% 짜리 유채색을 쓰고 바탕이 아주 어둡다.
  document.body.style.backgroundColor = 'rgb(15, 15, 17)';
  document.body.style.color = 'rgb(229, 226, 225)';
  document.body.innerHTML = '<hr id="rule" /><span id="brand">공간</span>';
  const hr = document.getElementById('rule') as HTMLElement;
  hr.setAttribute('style', 'border-top-width:1px;border-top-style:solid;border-top-color:rgba(179,139,109,0.12)');
  (document.getElementById('brand') as HTMLElement).style.color = 'rgb(179, 139, 109)';

  const theme = detectTheme(document.body);
  const ground = 'rgb(15, 15, 17)';
  const MIN = 24;

  it('선 색이 바탕과 최소 대비를 넘는다', () => {
    const c = contrast(theme.line, ground);
    expect(c, `line ${theme.line} 대비 ${c.toFixed(0)}`).toBeGreaterThanOrEqual(MIN);
  });

  it('생명선(옅은 선)도 보인다', () => {
    const c = contrast(theme.lineFaint, ground);
    expect(c, `lineFaint ${theme.lineFaint} 대비 ${c.toFixed(0)}`).toBeGreaterThanOrEqual(MIN);
  });

  it('옅은 선은 일반 선보다 옅다 — 위계가 뒤집히지 않는다', () => {
    expect(contrast(theme.lineFaint, ground)).toBeLessThan(contrast(theme.line, ground));
  });

  it('노드 면 세 단이 서로 구별된다', () => {
    const base = contrast(theme.nodeFill, ground);
    const alt = contrast(theme.nodeFillAlt, ground);
    const strong = contrast(theme.nodeFillStrong, ground);
    expect(base, `nodeFill 대비 ${base.toFixed(0)}`).toBeGreaterThanOrEqual(8);
    expect(alt, `nodeFillAlt(${alt.toFixed(0)}) 가 nodeFill(${base.toFixed(0)}) 보다 진해야 한다`).toBeGreaterThan(base + 3);
    expect(strong, `nodeFillStrong 대비 ${strong.toFixed(0)}`).toBeGreaterThan(base + 3);
  });
});
