import { parseFlowchart } from './parse/flowchart';
import { drawFlowchart } from './draw/flowchart';
import { defaultTheme } from './draw/theme';

export type Options = {
  accent?: string;
  idPrefix?: string;
};

export type Result = { svg: string | null; caption: string | null; warnings: string[] };

const CAPTION = /^\s*%%\s*caption:\s*(.+)$/m;
// 펜스 여는 줄: 들여쓰기(리스트 항목 지원) + 백틱 3개 이상 또는 물결 3개
// 이상 + 나머지 정보 문자열. 언어 태그가 뭐든(`mermaid` 가 아니어도) 일단
// "펜스가 열렸다"로만 본다 — 실제로 변환할지는 정보 문자열이 `mermaid`/
// `diagram` 으로 시작하는지에 달렸고, 그건 별도로 판정한다.
const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})([^\n]*)$/;

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

    const isTarget = /^(mermaid|diagram)\b/.test(info);
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
      out.push(r.caption ? `${r.svg}\n\n그림: ${r.caption}` : r.svg);
    }
    i = j + 1;
  }

  return out.join('\n');
}
