import { splitLines, LINE_HEIGHT } from './text';
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

/**
 * 글자 요소. 여러 줄이면 `<tspan>` 으로 나눈다.
 *
 * `y` 는 한 줄일 때의 기준선이다. 여러 줄이면 첫 줄을 그만큼 위로 올려
 * 전체 블록이 같은 자리에 가운데 정렬된다 — 호출하는 쪽은 줄 수를 몰라도
 * 한 줄일 때와 같은 `y` 를 넘기면 된다. 한 줄일 때의 출력은 전과 같다.
 */
export function text(content: string, a: Attrs): string {
  const lines = splitLines(content);
  if (lines.length <= 1) return `<text${attrs(a)}>${escapeXml(content)}</text>`;
  const fontSize = Number(a['font-size'] ?? 12);
  const lh = fontSize * LINE_HEIGHT;
  const x = a.x;
  const spans = lines.map((line, i) => {
    const dy = i === 0 ? -((lines.length - 1) / 2) * lh : lh;
    return `<tspan x="${x}" dy="${Math.round(dy * 100) / 100}">${escapeXml(line)}</tspan>`;
  });
  return `<text${attrs(a)}>${spans.join('')}</text>`;
}

export type Pt = { x: number; y: number };

/** 좌표 하나를 4px 격자에 맞춘다 — 레이아웃 결과 자체가 아니라 그리기 직전에만 적용한다. */
export function snap4(n: number): number {
  return Math.round(n / 4) * 4;
}

/** 점 하나(x,y)를 격자에 맞춘다. */
export function snapPoint<T extends Pt>(p: T): T {
  return { ...p, x: snap4(p.x), y: snap4(p.y) };
}

/** 위치+크기가 있는 값(레이아웃의 Placed 등)을 통째로 격자에 맞춘다. */
export function snapBox<T extends { x: number; y: number; w: number; h: number }>(b: T): T {
  return { ...b, x: snap4(b.x), y: snap4(b.y), w: snap4(b.w), h: snap4(b.h) };
}

/** path 좌표 하나의 부동소수 꼬리를 다듬는다(요소 속성과 같은 정밀도). */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 점 목록을 둥근 모서리 path 로 바꾼다. `routeEdge` 가 내는 직교 꺾은선을
 * `<polyline>` 대신 `<path>` 로 그리기 위한 변환 — 각 내부 꺾임에 반경
 * `radius` 의 원호(2차 베지어로 근사)를 넣는다. 인접 구간이 반경보다 짧으면
 * 그 구간 길이의 절반으로 줄여 원호가 옆 점을 넘지 않게 한다. 끝점 두 개는
 * 그대로 직선(L)으로 남긴다 — `marker-end` 가 마지막 구간의 방향으로 각도를
 * 잡으므로 끝은 항상 곧아야 한다.
 *
 * 다섯 다이어그램 타입이 전부 이 변환을 거치므로(간선이 있는 타입마다 하나씩),
 * 여기 하나로 모아 둔다 — 다섯 곳에 복사하면 반경·근사 방식이 어긋나기 쉽다.
 */
export function pathData(points: Pt[], radius = 6): string {
  if (points.length === 0) return '';
  if (points.length <= 2) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${r2(p.x)} ${r2(p.y)}`).join(' ');
  }
  const cmds: string[] = [`M ${r2(points[0]!.x)} ${r2(points[0]!.y)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!, curr = points[i]!, next = points[i + 1]!;
    const dPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dNext = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(radius, dPrev / 2, dNext / 2);
    const into = { x: curr.x - ((curr.x - prev.x) / dPrev) * r, y: curr.y - ((curr.y - prev.y) / dPrev) * r };
    const out = { x: curr.x + ((next.x - curr.x) / dNext) * r, y: curr.y + ((next.y - curr.y) / dNext) * r };
    cmds.push(`L ${r2(into.x)} ${r2(into.y)}`);
    cmds.push(`Q ${r2(curr.x)} ${r2(curr.y)} ${r2(out.x)} ${r2(out.y)}`);
  }
  const last = points[points.length - 1]!;
  cmds.push(`L ${r2(last.x)} ${r2(last.y)}`);
  return cmds.join(' ');
}

/** 축소 하한. 이보다 더 줄이지 않고 가로로 스크롤한다. */
const MIN_SCALE = 0.85;

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
  // 축소 하한 + 가로 스크롤.
  //
  // `max-width: 100%` 만 걸면 좁은 화면에서 **끝없이** 줄어든다 — 실측에서
  // 1012px 짜리 상태도가 704px 열에 들어가느라 0.70 배가 되고 글자가 화면에서
  // 11.1px 이 됐다(본문 16.3px 의 68%). 같은 글에서 다이어그램마다 글자 크기가
  // 11.1 / 14.8 / 16.0 으로 갈렸다.
  //
  // `min-width` 는 CSS 우선순위에서 `max-width` 를 이긴다. 그래서 고유 폭의
  // 85% 를 min-width 로 걸어 두면 열이 그보다 넓을 때는 `max-width: 100%` 가
  // 이겨 그대로/줄어들고, 열이 그보다 좁아지면 min-width 가 이겨 넘치며
  // 바깥 상자가 스크롤한다. 결과적으로 배율이 0.85 아래로 안 내려가고
  // 글자 크기가 페이지 안에서 일정하게 유지된다.
  //
  // 스타일은 인라인으로 낸다 — `<style>` 은 sanitizer 가 지우고, 소비 사이트에
  // CSS 를 요구하면 「붙이면 그냥 되는」 성질이 깨진다. 인라인 `style` 속성과
  // 래퍼 `div` 는 실제 발행 경로(marked + DOMPurify)를 통과하는 것을 확인했다.
  const floor = Math.round(w * MIN_SCALE);
  const open = `<div style="overflow-x:auto"><svg width="${w}" height="${h}" viewBox="${origin} ${origin} ${w} ${h}" role="img" aria-label="${escapeXml(o.label)}" style="min-width:${floor}px;max-width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">`;
  return [open, ...lines, '</svg></div>'].join('\n');
}
