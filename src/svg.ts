/**
 * 발행 경로가 지우는 태그. 검사로 잡는 대신 **낼 수 없게** 한다 —
 * `el()` 과 `svgRoot()` 이 런타임에 던진다.
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
  // Flatten: split every body string on newlines to get real output lines
  const allLines = o.body.flatMap((s) => s.split('\n'));
  // Filter empty lines
  const lines = allLines.filter((l) => l.trim().length > 0);
  // Check for forbidden tags in any line
  for (const line of lines) {
    for (const tag of FORBIDDEN) {
      if (new RegExp(`<${tag}(?:\\s|>|/)`, 'i').test(line)) {
        throw new Error(`금지된 태그: ${tag}`);
      }
    }
  }
  const w = Math.round(o.width + p * 2);
  const h = Math.round(o.height + p * 2);
  const origin = Math.round(-p * 100) / 100;
  // width/height 를 함께 낸다. viewBox 만 있으면 SVG 에 고유 크기가 없어서 브라우저가
  // 컨테이너 폭에 맞춰 **늘린다** — 좁은 그림일수록 심하게 부푼다(122×194 클래스 그림이
  // 704×1119 로 5.8배가 된 실측). 고유 크기가 있으면 `max-width:100%; height:auto` 가
  // 좁은 화면에서 줄이기만 하고 확대하지 않는다.
  const open = `<svg width="${w}" height="${h}" viewBox="${origin} ${origin} ${w} ${h}" role="img" aria-label="${escapeXml(o.label)}" xmlns="http://www.w3.org/2000/svg">`;
  return [open, ...lines, '</svg>'].join('\n');
}
