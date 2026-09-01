import { EDITORIAL, WEIGHT, type Theme } from './draw/theme';

/**
 * DOM 서피스는 이 파일 하나로 국한한다. `tsconfig.json` 은 "dom" lib 을 켜지
 * 않는다 — 라이브러리를 Node 에서 import 할 때 2만 줄짜리 dom.d.ts 를 끌어들이지
 * 않기 위해서다. 그래서 여기서 실제로 읽는 만큼만 로컬로 선언한다: 이 인터페이스는
 * 모듈 스코프라(이 파일이 import/export 를 쓰는 모듈이라서) 다른 파일의 타입체크에
 * 영향을 주지 않고, 런타임 코드도 만들지 않는다(선언은 컴파일타임 전용) — 실제
 * 브라우저 타입과는 구조적으로만 맞으면 된다.
 */
interface Element {
  readonly parentElement: Element | null;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): ArrayLike<Element>;
}
interface ComputedStyle {
  backgroundColor: string;
  color: string;
  borderTopWidth: string;
  borderTopColor: string;
  borderRadius: string;
  fontSize: string;
}
declare const document: {
  readonly body: Element;
  querySelector(selector: string): Element | null;
};
declare function getComputedStyle(el: Element): ComputedStyle;

// ---- 색 계산 --------------------------------------------------------------

type Rgba = { r: number; g: number; b: number; a: number };

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

/**
 * `rgb()`/`rgba()`(콤마·공백 구분 모두)와 `color(srgb r g b [/ a])` 를 받는다.
 * 후자는 크롬이 `color-mix()` 로 만들어진 값의 computed style 을 이 형태로
 * 낸다 — 채널이 0~1 스케일이라 `rgb()` 의 0~255 스케일과 다르다(255 를 곱해야 한다).
 * 못 읽으면 `null` — 감지가 던지지 않는다는 계약을 이 파싱 단에서부터 지킨다.
 */
function parseColor(value: string): Rgba | null {
  const v = value.trim();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(v);
  if (m) {
    return {
      r: clampByte(Number(m[1])), g: clampByte(Number(m[2])), b: clampByte(Number(m[3])),
      a: parseAlpha(m[4]),
    };
  }

  m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(v);
  if (m) {
    return {
      r: clampByte(Number(m[1]) * 255), g: clampByte(Number(m[2]) * 255), b: clampByte(Number(m[3]) * 255),
      a: parseAlpha(m[4]),
    };
  }

  return null;
}

function fmt(c: Rgba): string {
  const r = clampByte(c.r), g = clampByte(c.g), b = clampByte(c.b);
  return c.a >= 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${Math.round(c.a * 1000) / 1000})`;
}

/** `a` 에서 `b` 쪽으로 `t`(0~1) 만큼 섞는다. 둘 중 하나라도 못 읽으면 `a` 를 그대로
 * 돌려준다 — 팔레트를 못 읽어도 렌더는 절대 던지지 않는다는 계약을 여기서도 지킨다. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a), cb = parseColor(b);
  if (!ca || !cb) return a;
  return fmt({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
    a: ca.a + (cb.a - ca.a) * t,
  });
}

/** `c` 의 불투명도를 `a`(0~1) 로 바꾼다. 못 읽으면 `c` 를 그대로 돌려준다. */
export function withAlpha(c: string, a: number): string {
  const parsed = parseColor(c);
  if (!parsed) return c;
  return fmt({ ...parsed, a });
}

// ---- 페이지 샘플링 ----------------------------------------------------------

function hasOpaqueBackground(cs: ComputedStyle): boolean {
  const c = parseColor(cs.backgroundColor);
  return c !== null && c.a > 0;
}

/** 배경은 상속되지 않는 CSS 프로퍼티라 진짜 바탕색을 알려면 조상을 올라가야 한다
 * — `el` 자기 자신부터 검사한다(불투명 배경을 el 스스로 갖고 있을 수 있어서). */
function sampleGround(el: Element): string {
  let cur: Element | null = el;
  while (cur) {
    const cs = getComputedStyle(cur);
    if (hasOpaqueBackground(cs)) return cs.backgroundColor;
    cur = cur.parentElement;
  }
  return 'rgb(255, 255, 255)'; // 조상이 전부 투명하면(드묾) 밝은 바탕을 가정한다
}

function sampleInk(el: Element): string {
  return getComputedStyle(el).color;
}

/** 거의 모든 사이트가 브랜드색을 링크에 칠한다 — 이름을 모르는 변수를 찾는 대신
 * 실제로 그 색이 쓰인 자리를 찾는다. */
function sampleAction(el: Element, ink: string): string {
  const link = el.querySelector('a[href]') ?? document.querySelector('a[href]');
  return link ? getComputedStyle(link).color : ink;
}

function borderWidthPx(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function structureCandidate(el: Element, selector: string): Element | null {
  const found = el.querySelectorAll(selector);
  for (let i = 0; i < found.length; i++) {
    const cand = found[i]!;
    const cs = getComputedStyle(cand);
    if (borderWidthPx(cs.borderTopWidth) <= 0) continue;
    const c = parseColor(cs.borderTopColor);
    if (c && c.a > 0) return cand;
  }
  return null;
}

/** 구분선(hr) → 표 칸 → 아무 자손 순으로, 테두리가 실제로 그려진(폭>0, 불투명) 첫
 * 자손을 찾는다. 못 찾으면 잉크를 바탕 쪽으로 크게 옅힌다 — 실사용 테두리는 보통
 * 본문 글자보다 훨씬 밝고 배경에 가깝다. */
function sampleStructure(el: Element, ink: string, ground: string): string {
  const found = structureCandidate(el, 'hr') ?? structureCandidate(el, 'td, th') ?? structureCandidate(el, '*');
  if (found) return getComputedStyle(found).borderTopColor;
  return mix(ink, ground, 0.7);
}

function luminance(c: string): number {
  const p = parseColor(c);
  return p ? 0.299 * p.r + 0.587 * p.g + 0.114 * p.b : 128; // 못 읽으면 손대지 않는다(중간값)
}

/** 테두리 색이 배경과 거의 구별 안 되면(사이트 자체가 저대비인 경우) 잉크 쪽으로
 * 끌어올려 최소한의 대비를 보장한다 — 옅어도 보이는 테두리가 안 보이는 것보다 낫다. */
function ensureContrast(structure: string, ground: string, ink: string): string {
  const MIN_LUMINANCE_DIFF = 24; // 0~255 스케일, 경험적 임계값
  if (Math.abs(luminance(structure) - luminance(ground)) >= MIN_LUMINANCE_DIFF) return structure;
  return mix(structure, ink, 0.6);
}

function sampleMuted(el: Element, ink: string, ground: string): string {
  const cand = el.querySelector('figcaption, small, time, [class*="muted"]');
  if (cand) {
    const c = getComputedStyle(cand).color;
    if (c !== ink) return c;
  }
  return mix(ink, ground, 0.45);
}

function sampleRadius(el: Element): number {
  const cand = el.querySelector('button, [class*="card"], [class*="btn"]');
  if (cand) {
    const n = parseFloat(getComputedStyle(cand).borderRadius);
    if (Number.isFinite(n)) return Math.max(0, Math.min(10, n));
  }
  return 6;
}

function sampleFontSize(el: Element): number {
  const n = parseFloat(getComputedStyle(el).fontSize);
  return Number.isFinite(n) ? Math.max(10, Math.min(16, n)) : 12;
}

// ---- Theme 조립 -------------------------------------------------------------

const cache = new WeakMap<Element, Theme>();

/**
 * 살아 있는 페이지에서 팔레트를 읽어 `Theme` 을 만든다. 사이트마다 토큰 이름이
 * 다 달라서(`--brand`, `--primary`, `--ko-accent-primary`…) 이름으로 찾을 수는
 * 없고, 실제로 칠해진 색을 읽는 게 유일한 방법이다. 각 필드는 여전히
 * `var(--fs-…, 감지값)` 형태다 — 감지값은 fallback 일 뿐이라, 소비 사이트가
 * 직접 `--fs-ink` 등을 지정하면 그쪽이 이긴다(CSS 가 이긴다는 기존 원칙 그대로).
 *
 * 강조를 칠할 실제 색(링크)을 못 찾으면 — 링크가 없는 문서, DOM 이 없는 경로,
 * 그 밖에 표본을 전부 무력화하는 사이트 — 절반만 감지된 값을 짜맞추는 대신
 * 처음부터 `EDITORIAL`(무채색 위계) 로 내려간다. 의도적으로 디자인된 무채색
 * 쪽이, 못 찾은 값 자리에 어중간한 기본값을 채운 팔레트보다 항상 낫다.
 *
 * `theme.lineFaint`/`theme.muted` 는 그리는 쪽에서 이미 FAINT_OPACITY·
 * MUTED_OPACITY 를 얹어 쓴다 — 그래서 여기서는 구조/뮤트 표본을 불투명 그대로
 * 넘긴다(감지된 색은 잉크와 이미 다른 색상이라 그 자체로 옅어 보인다 —
 * `EDITORIAL` 처럼 잉크와 같은 색일 때만 알파가 유일한 수단이다).
 */
export function detectTheme(el: Element = document.body): Theme {
  const cached = cache.get(el);
  if (cached) return cached;

  const ground = sampleGround(el);
  const ink = sampleInk(el);
  const action = sampleAction(el, ink);

  if (action === ink) {
    cache.set(el, EDITORIAL);
    return EDITORIAL;
  }

  const structure = ensureContrast(sampleStructure(el, ink, ground), ground, ink);
  const muted = sampleMuted(el, ink, ground);
  const radius = sampleRadius(el);
  const fontSize = sampleFontSize(el);

  const nodeFill = mix(ground, ink, 0.04);
  const accentFill = withAlpha(action, 0.1);

  const theme: Theme = {
    ink: `var(--fs-ink, ${ink})`,
    muted: `var(--fs-muted, ${muted})`,
    line: `var(--fs-line, ${structure})`,
    lineFaint: `var(--fs-line-faint, ${structure})`,
    nodeFill: `var(--fs-node-fill, ${nodeFill})`,
    nodeBorder: `var(--fs-node-border, ${structure})`,
    accent: `var(--fs-accent, ${action})`,
    accentFill: `var(--fs-accent-fill, ${accentFill})`,
    label: `var(--fs-label, ${muted})`,
    labelChip: `var(--fs-label-chip, ${ground})`,
    radius: `var(--fs-radius, ${radius})`,
    fontSize,
    labelSize: fontSize - 3,
    pad: 14,
    accentStrokeWidth: 1.25,
    accentWeight: WEIGHT.label,
  };

  cache.set(el, theme);
  return theme;
}

/**
 * `renderDiagram`/`inlineDiagrams` 가 쓰는 안전한 진입점. Node 에는 `document`
 * 가 없으니 호출 전에 존재를 확인하고, 감지 중 무엇이 실패하든(알 수 없는 색
 * 형식, 스타일 접근 실패…) 절대 던지지 않는다 — 못 읽은 팔레트는 저자의 잘못이
 * 아니므로 이 실패는 `warnings` 에도 안 남기고 조용히 기존 기본값으로 내려간다.
 */
export function detectThemeSafely(): Theme | null {
  if (typeof document === 'undefined') return null;
  try {
    return detectTheme();
  } catch {
    return null;
  }
}
