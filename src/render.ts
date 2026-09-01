import { parseFlowchart } from './parse/flowchart';
import { drawFlowchart } from './draw/flowchart';
import { defaultTheme } from './draw/theme';

export type Options = {
  accent?: string;
  idPrefix?: string;
};

export type Result = { svg: string | null; caption: string | null; warnings: string[] };

const CAPTION = /^\s*%%\s*caption:\s*(.+)$/m;
// mermaid 뒤(혹은 diagram 뒤)에 오는 나머지 정보 문자열(`title=x` 같은 것)은
// 무시한다 — 펜스를 여는 줄 전체가 아니라 언어 태그만 본다. 닫는 펜스는 들여쓴
// 리스트 항목 안에 있을 수 있어 줄 앞 공백을 허용한다(`^```` 로 고정하면
// 들여쓴 펜스를 못 찾는다).
const FENCE = /^([ \t]*)(`{3,}|~{3,})(?:mermaid|diagram)[^\n]*\n([\s\S]*?)^\1\2[ \t]*$/gm;

function captionOf(src: string): string | null {
  return CAPTION.exec(src)?.[1]?.trim() ?? null;
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

  const theme = defaultTheme(opts.accent);
  const idPrefix = opts.idPrefix ?? 'd1';
  const label = caption ?? '다이어그램';
  const head = source.split('\n').map((l) => l.trim()).find((l) => l.length > 0 && !l.startsWith('%%')) ?? '';

  try {
    if (/^flowchart\b/.test(head)) {
      const model = parseFlowchart(stripLeadingComments(source));
      if ('error' in model) { warnings.push(model.error); return { svg: null, caption, warnings }; }
      return { svg: drawFlowchart(model, theme, idPrefix, label), caption, warnings };
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

export function inlineDiagrams(markdown: string, opts: Options = {}): string {
  let n = 0;
  FENCE.lastIndex = 0;
  return markdown.replace(FENCE, (whole, _indent: string, _fenceChars: string, body: string) => {
    n += 1;
    const r = renderDiagram(body, { ...opts, idPrefix: opts.idPrefix ?? `d${n}` });
    if (!r.svg) return whole;                       // 실패하면 코드블록으로 남긴다
    return r.caption ? `${r.svg}\n\n그림: ${r.caption}` : r.svg;
  });
}
