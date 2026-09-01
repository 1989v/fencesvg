/**
 * 발행 경로가 지우는 태그. 검사로 잡는 대신 **낼 수 없게** 한다 —
 * 검사는 통과시킬 수 있지만 여기서는 컴파일된 코드가 던진다.
 */
const FORBIDDEN = new Set(['style', 'script', 'use', 'foreignObject']);

export type Attrs = Record<string, string | number | undefined>;

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function attrs(a: Attrs): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? round(v) : escapeXml(String(v))}"`)
    .join('');
}

/** 좌표의 부동소수 꼬리는 스냅샷을 깨뜨린다 */
function round(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function el(tag: string, a: Attrs, children?: string[]): string {
  if (FORBIDDEN.has(tag)) throw new Error(`금지된 태그: ${tag}`);
  if (!children || children.length === 0) return `<${tag}${attrs(a)}/>`;
  return `<${tag}${attrs(a)}>${children.join('')}</${tag}>`;
}

export function text(content: string, a: Attrs): string {
  return `<text${attrs(a)}>${escapeXml(content)}</text>`;
}

/** `pad` 는 viewBox 를 바깥으로 여는 여백이다 — 모든 좌표를 옮기는 것보다 싸다 */
export function svgRoot(o: { width: number; height: number; label: string; body: string[]; pad?: number }): string {
  const p = o.pad ?? 0;
  const open = `<svg viewBox="${-p} ${-p} ${Math.round(o.width + p * 2)} ${Math.round(o.height + p * 2)}" role="img" aria-label="${escapeXml(o.label)}" xmlns="http://www.w3.org/2000/svg">`;
  // 빈 줄은 CommonMark 가 HTML 블록을 끊는 자리다. filter 로 원천 차단한다.
  const lines = o.body.filter((l) => l.trim().length > 0);
  return [open, ...lines, '</svg>'].join('\n');
}
