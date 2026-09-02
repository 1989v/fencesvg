import { parseFlowchart } from './parse/flowchart';
import { drawFlowchart } from './draw/flowchart';
import { parseState } from './parse/state';
import { drawState } from './draw/state';
import { parseEr } from './parse/er';
import { drawEr } from './draw/er';
import { parseClass } from './parse/class';
import { drawClass } from './draw/class';
import { parseSequence } from './parse/sequence';
import { drawSequence } from './draw/sequence';
import { defaultTheme } from './draw/theme';
import { detectThemeSafely } from './auto';

export type Options = {
  accent?: string;
  idPrefix?: string;
};

export type Result = { svg: string | null; caption: string | null; warnings: string[] };

const CAPTION = /^\s*%%\s*caption:\s*(.+)$/m;
// `%% source` 한 줄이 있으면 원문과 그림을 나란히 낸다. mermaid 주석이라
// 다른 렌더러에서는 그냥 무시된다 — 정보 문자열을 건드리면 그쪽에서 태그가
// 깨진다.
const SOURCE_DIRECTIVE = /^\s*%%\s*source\s*$/m;
// 펜스 여는 줄: 들여쓰기(리스트 항목 지원) + 백틱 3개 이상 또는 물결 3개
// 이상 + 나머지 정보 문자열. 언어 태그가 뭐든(`mermaid` 가 아니어도) 일단
// "펜스가 열렸다"로만 본다 — 실제로 변환할지는 정보 문자열이 `mermaid`/
// `diagram` 으로 시작하는지에 달렸고, 그건 별도로 판정한다.
const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})([^\n]*)$/;

function captionOf(src: string): string | null {
  return CAPTION.exec(src)?.[1]?.trim() ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 원문과 그림을 나란히 낸다.
 *
 * 두 칸은 `auto-fit` 격자다 — 미디어 쿼리를 못 쓰는 인라인 스타일에서
 * 좁은 화면 대응을 하는 유일한 방법이고, 컨테이너가 두 칸을 못 담으면
 * 알아서 한 칸으로 쌓인다.
 *
 * 지시문 두 줄(`%% caption:`·`%% source`)은 원문에서 뺀다. 읽는 사람이
 * 베껴 갈 것은 다이어그램 문법이지 이 라이브러리의 지시문이 아니다.
 */
function sourcePair(body: string, svg: string): string {
  const shown = body
    .split('\n')
    .filter((l) => !CAPTION.test(l) && !SOURCE_DIRECTIVE.test(l))
    .join('\n')
    .trim();
  const code = `<pre><code class="language-mermaid">${escapeHtml(shown)}</code></pre>`;
  const style = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;align-items:start';
  return `<div class="fs-pair" style="${style}">${code}${svg}</div>`;
}

/**
 * `parseFlowchart` 는 자기 앞의 빈 줄만 건너뛰고 첫 줄이 `flowchart` 로
 * 시작하는지를 본다 — 몸통 안의 `%%` 주석은 건너뛰지만 맨 앞 줄이 주석이면
 * "flowchart 선언으로 시작하지 않는다" 로 잘못 튕긴다. `%% caption:` 은
 * 관례상 맨 앞줄에 오므로(브리프 예시·아래 테스트) 여기서 미리 걷어내
 * parseFlowchart 가 실제 선언 줄부터 보게 한다 — parseFlowchart 자체는
 * 이미 검증된 것이라 손대지 않는다.
 */
function stripLeadingComments(source: string): string {
  const lines = source.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i]!.trim() === '' || lines[i]!.trim().startsWith('%%'))) i++;
  return lines.slice(i).join('\n');
}

export function renderDiagram(source: string, opts: Options = {}): Result {
  const warnings: string[] = [];
  const caption = captionOf(source);
  if (!caption) warnings.push('캡션이 없다. `%% caption:` 한 줄을 넣으면 그림을 못 보는 사람도 읽는다');

  // 명시로 accent 를 주면 그 값이 항상 이긴다 — 감지는 아예 시도하지 않는다.
  // 안 주고 브라우저에서 돌면 페이지에서 읽은 팔레트로, 그마저 안 되면(Node,
  // 또는 감지 실패) 기존 기본값(currentColor)으로 내려간다.
  const theme = opts.accent !== undefined
    ? defaultTheme(opts.accent)
    : (detectThemeSafely() ?? defaultTheme());
  const idPrefix = opts.idPrefix ?? 'd1';
  const label = caption ?? '다이어그램';
  const head = source.split('\n').map((l) => l.trim()).find((l) => l.length > 0 && !l.startsWith('%%')) ?? '';

  try {
    if (/^flowchart\b/.test(head)) {
      const model = parseFlowchart(stripLeadingComments(source));
      if ('error' in model) { warnings.push(model.error); return { svg: null, caption, warnings }; }
      // 그린 **뒤에** 경고를 모은다 — 그룹 테두리를 포기했다 같은 사실은
      // 배치가 끝나야 알 수 있어서 작도가 `model.warnings` 에 밀어 넣는다.
      // 먼저 펼치면 그 경고가 조용히 사라진다(실제로 그랬다).
      const svg = drawFlowchart(model, theme, idPrefix, label);
      warnings.push(...model.warnings);
      return { svg, caption, warnings };
    }
    if (/^stateDiagram(-v2)?\b/.test(head)) {
      const model = parseState(stripLeadingComments(source));
      if ('error' in model) { warnings.push(model.error); return { svg: null, caption, warnings }; }
      const svg = drawState(model, theme, idPrefix, label);
      warnings.push(...model.warnings);
      return { svg, caption, warnings };
    }
    if (/^erDiagram\b/.test(head)) {
      const model = parseEr(stripLeadingComments(source));
      if ('error' in model) { warnings.push(model.error); return { svg: null, caption, warnings }; }
      return { svg: drawEr(model, theme, idPrefix, label), caption, warnings };
    }
    if (/^classDiagram\b/.test(head)) {
      const model = parseClass(stripLeadingComments(source));
      if ('error' in model) { warnings.push(model.error); return { svg: null, caption, warnings }; }
      return { svg: drawClass(model, theme, idPrefix, label), caption, warnings };
    }
    if (/^sequenceDiagram\b/.test(head)) {
      const model = parseSequence(stripLeadingComments(source));
      if ('error' in model) { warnings.push(model.error); return { svg: null, caption, warnings }; }
      return { svg: drawSequence(model, theme, idPrefix, label), caption, warnings };
    }
    // head 가 빈 문자열이면(소스가 `%%` 주석뿐이라 선언 줄이 아예 없는 경우)
    // split(' ')[0] 도 빈 문자열이라 `?? '(빈 내용)'` 은 안 걸린다(null/undefined
    // 가 아니라서) — `||` 로 빈 문자열도 같이 잡는다.
    warnings.push(`아직 지원하지 않는 다이어그램이다: ${head.split(/\s/)[0] || '(빈 내용)'}`);
    return { svg: null, caption, warnings };
  } catch (e) {
    // 라이브러리는 던지지 않는다. 글 하나의 오타가 페이지를 흰 화면으로 만들면 안 된다.
    warnings.push(`그리는 중 오류: ${e instanceof Error ? e.message : String(e)}`);
    return { svg: null, caption, warnings };
  }
}

/**
 * CommonMark 대로: 펜스 안은 자기 닫는 펜스(같은 문자, 길이는 여는 쪽 이상,
 * 나머지는 공백)를 만나기 전까진 전부 리터럴이다 — 안에서 다른 펜스가 여는
 * 것처럼 보이는 줄도 "새 펜스 열기"가 아니라 그냥 그 줄의 문자일 뿐이다.
 * `indent` 는 여는 줄 것과 정확히 같아야 닫힌 것으로 본다(들여쓰기가
 * 조금 달라도 닫힌 것으로 치는 CommonMark 의 느슨한 규칙까지는 안 간다 —
 * 리스트 항목처럼 들여쓰기가 고정된 실사용 범위에선 이 정도로 충분하다).
 */
function closerAt(lines: string[], j: number, indent: string, fenceChar: string, minLen: number): boolean {
  const line = lines[j];
  if (line === undefined || !line.startsWith(indent)) return false;
  const rest = line.slice(indent.length);
  let k = 0;
  while (k < rest.length && rest[k] === fenceChar) k++;
  return k >= minLen && rest.slice(k).trim() === '';
}

export function inlineDiagrams(markdown: string, opts: Options = {}): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let n = 0;
  let i = 0;

  while (i < lines.length) {
    const open = FENCE_OPEN.exec(lines[i]!);
    if (!open) { out.push(lines[i]!); i++; continue; }

    const [, indent, fenceChars, info] = open as unknown as [string, string, string, string];
    const fenceChar = fenceChars[0]!;
    let j = i + 1;
    while (j < lines.length && !closerAt(lines, j, indent, fenceChar, fenceChars.length)) j++;

    if (j >= lines.length) {
      // 안 닫혔다 — 여기부터 문서 끝까지 전부 그 펜스의 리터럴 몸통이다.
      // 그 안에 진짜 mermaid 펜스처럼 보이는 줄이 있어도 "새로 열린 펜스"가
      // 아니므로 더 훑지 않고 나머지를 통째로 원문 그대로 낸다.
      out.push(...lines.slice(i));
      break;
    }

    // `\b` 는 하이픈에서도 걸린다(글자↔기호 경계) — `mermaid-extra` 같은,
    // 일부러 그림으로 안 바뀌게 남겨두려는 태그까지 대상으로 잡아버린다.
    // 언어 태그 뒤에 공백이나 줄 끝이 와야만 진짜 태그로 본다.
    const isTarget = /^(mermaid|diagram)(\s|$)/.test(info);
    if (!isTarget) {
      out.push(...lines.slice(i, j + 1));            // 대상 아닌 펜스는 안쪽까지 통째로 리터럴
      i = j + 1;
      continue;
    }

    n += 1;
    const body = lines.slice(i + 1, j).join('\n');
    const r = renderDiagram(body, { ...opts, idPrefix: opts.idPrefix ?? `d${n}` });
    if (!r.svg) {
      out.push(...lines.slice(i, j + 1));             // 실패하면 코드블록으로 남긴다
    } else {
      // "그림: " 접두어가 붙어 캡션이 줄 맨 앞에 오지 않으므로, 캡션 앞머리의
      // `#`/`-` 같은 마크다운 특수문자가 헤딩·리스트로 오작동할 일이 없다 —
      // 그래서 이스케이프를 안 한다(강조 마크업은 오히려 의도한 대로 쓰게 둔다).
      const rendered = SOURCE_DIRECTIVE.test(body) ? sourcePair(body, r.svg) : r.svg;
      out.push(r.caption ? `${rendered}\n\n그림: ${r.caption}` : rendered);
    }
    i = j + 1;
  }

  return out.join('\n');
}
