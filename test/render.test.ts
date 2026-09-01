import { describe, it, expect } from 'vitest';
import { renderDiagram, inlineDiagrams } from '../src/render';

const FENCE = '```mermaid\n%% caption: 주문은 결제 승인 뒤에 재고를 잡는다\nflowchart LR\n  A[주문] --> B[결제]\n```';

describe('renderDiagram', () => {
  it('캡션 주석을 뽑아낸다', () => {
    const r = renderDiagram('%% caption: 설명이다\nflowchart LR\n A[a] --> B[b]');
    expect(r.caption).toBe('설명이다');
    expect(r.svg).toContain('aria-label="설명이다"');
  });

  it('캡션이 없으면 경고한다', () => {
    const r = renderDiagram('flowchart LR\n A[a] --> B[b]');
    expect(r.warnings.some((w) => w.includes('캡션'))).toBe(true);
    expect(r.svg).not.toBeNull();
  });

  it('던지지 않고 실패를 돌려준다', () => {
    const r = renderDiagram('flowchart LR\n subgraph s\n A --> B\n end');
    expect(r.svg).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('알 수 없는 타입도 던지지 않는다', () => {
    const r = renderDiagram('gantt\n title x');
    expect(r.svg).toBeNull();
  });
});

describe('inlineDiagrams', () => {
  const md = `앞 문장.\n\n${FENCE}\n\n뒤 문장.`;
  const out = inlineDiagrams(md);

  it('펜스를 SVG 로 바꾼다', () => {
    expect(out).toContain('<svg');
    expect(out).not.toContain('```mermaid');
  });

  it('캡션 줄을 SVG 블록 밖에 넣는다', () => {
    const lines = out.split('\n');
    const close = lines.findIndex((l) => l.includes('</svg>'));
    expect(lines[close + 1]).toBe('');
    expect(lines[close + 2]).toBe('그림: 주문은 결제 승인 뒤에 재고를 잡는다');
  });

  it('SVG 안에 빈 줄이 없다', () => {
    // `</svg>` 는 항상 자기 줄에 있어 그 앞엔 반드시 개행이 온다 — indexOf
    // 로 자르면 그 개행이 몸통 끝에 남아 split 마지막 칸이 빈 문자열이 되고,
    // 실제로는 없는 "빈 줄"을 있는 것처럼 잡아낸다. 그 개행 앞까지만 잘라야
    // 진짜 몸통(빈 줄 없이 요소 하나당 한 줄)만 검사한다.
    const body = out.slice(out.indexOf('<svg'), out.lastIndexOf('\n</svg>'));
    expect(body.split('\n').every((l) => l.trim().length > 0)).toBe(true);
  });

  it('앞뒤 문장을 보존한다', () => {
    expect(out).toContain('앞 문장.');
    expect(out).toContain('뒤 문장.');
  });

  it('그림이 둘이면 id 접두어가 갈린다', () => {
    const two = inlineDiagrams(`${FENCE}\n\n${FENCE}`);
    expect(two).toContain('id="d1-arrow"');
    expect(two).toContain('id="d2-arrow"');
  });

  it('실패한 펜스는 원래 코드블록으로 남는다', () => {
    const bad = inlineDiagrams('```mermaid\nflowchart LR\n subgraph s\n end\n```');
    expect(bad).toContain('```mermaid');
  });

  it('펜스가 없으면 원문 그대로다', () => {
    expect(inlineDiagrams('그냥 글이다.')).toBe('그냥 글이다.');
  });

  it('정보 문자열에 군더더기가 있어도 언어 태그만 본다', () => {
    const out2 = inlineDiagrams('```mermaid title=x\n%% caption: c\nflowchart LR\n A-->B\n```');
    expect(out2).toContain('<svg');
  });

  it('mermaid 대신 diagram 태그도 받는다', () => {
    const out2 = inlineDiagrams('```diagram\n%% caption: c\nflowchart LR\n A-->B\n```');
    expect(out2).toContain('<svg');
  });

  it('언어 태그는 토큰 경계까지만 본다 — mermaid-extra 처럼 하이픈으로 이어붙은 태그는 대상이 아니다', () => {
    // `\b` 는 글자↔하이픈 경계에서도 걸려서 `mermaid-extra`/`diagram-old` 를
    // 대상으로 잘못 잡던 버그가 있었다 — 뒤에 공백/줄끝이 와야만 진짜 태그.
    const cases: [string, boolean][] = [
      ['mermaid', true],
      ['mermaid title=x', true],
      ['mermaid_x', false],
      ['mermaid-extra', false],
      ['diagram', true],
      ['diagram-old', false],
    ];
    for (const [info, shouldConvert] of cases) {
      const out2 = inlineDiagrams(`\`\`\`${info}\n%% caption: c\nflowchart LR\n A-->B\n\`\`\``);
      expect(out2.includes('<svg'), `info="${info}"`).toBe(shouldConvert);
      expect(out2.includes(`\`\`\`${info}`), `info="${info}"`).toBe(!shouldConvert);
    }
  });

  it('리스트 항목 안 들여쓴 펜스도 찾는다', () => {
    const out2 = inlineDiagrams('- item\n  ```mermaid\n  %% caption: c\n  flowchart LR\n   A-->B\n  ```\n');
    expect(out2).toContain('<svg');
    expect(out2).toContain('- item');
  });

  it('물결(~~~) 펜스도 받는다', () => {
    const out2 = inlineDiagrams('~~~mermaid\n%% caption: c\nflowchart LR\n A-->B\n~~~');
    expect(out2).toContain('<svg');
  });

  it('문서 맨 앞/맨 뒤(빈 줄 없이)에서도 펜스를 찾는다', () => {
    const front = inlineDiagrams('```mermaid\n%% caption: c\nflowchart LR\n A-->B\n```\n뒤 문장 바로 이어짐');
    expect(front).toContain('<svg');
    expect(front).toContain('뒤 문장 바로 이어짐');
    const back = inlineDiagrams('앞 문장 바로 이어짐\n```mermaid\n%% caption: c\nflowchart LR\n A-->B\n```');
    expect(back).toContain('<svg');
    expect(back).toContain('앞 문장 바로 이어짐');
  });

  it('닫히지 않은 펜스는 손대지 않는다', () => {
    const unclosed = '```mermaid\n%% caption: c\nflowchart LR\n A-->B\n';
    expect(inlineDiagrams(unclosed)).toBe(unclosed);
  });

  // 펜스 중첩: 다른 펜스로 감싸 "예시로 보여주려는" mermaid 펜스는 그림으로
  // 바뀌면 안 된다. CommonMark 규칙 — 펜스 안은 자기 닫는 펜스(같은 문자,
  // 길이 이상)를 만나기 전까진 전부 리터럴이다. 안쪽처럼 보이는 줄은 열기로
  // 치지 않는다.
  it('마크다운 예시 블록(````markdown) 안에 감싼 mermaid 펜스는 그대로 남는다', () => {
    // 이 라이브러리 자신의 소개 글이 쓸 정확한 모양: 밖은 4백틱+markdown 태그로
    // "펜스 소스를 그대로 보여주고", 그 뒤에 실제로 렌더할 진짜 펜스가 하나 더 온다.
    const md2 =
      '````markdown\n```mermaid\n%% caption: 설명\nflowchart LR\n  A --> B\n```\n````\n\n' +
      '```mermaid\n%% caption: 설명\nflowchart LR\n  A --> B\n```';
    const out2 = inlineDiagrams(md2);
    expect(out2.match(/<svg/g)?.length).toBe(1);
    expect(out2.match(/```mermaid/g)?.length).toBe(1);
  });

  it('~~~markdown 으로 감싼 안쪽 ```mermaid 펜스는 손대지 않는다', () => {
    const md2 = '~~~markdown\n```mermaid\n%% caption: c\nflowchart LR\n A-->B\n```\n~~~';
    expect(inlineDiagrams(md2)).toBe(md2);
  });

  it('같은 문자·더 긴 바깥 펜스(````mermaid)는 하나의 펜스로 처리된다', () => {
    // 바깥 자체가 target(mermaid) 이라 변환을 시도하지만, 몸통에 안쪽 펜스
    // 마커(```mermaid ... ```)가 리터럴 텍스트로 그대로 포함되어 flowchart 로
    // 못 읽으므로 렌더가 실패하고, 실패 시 규칙대로 원문 전체가 그대로 남는다
    // — 안쪽의 3백틱을 별도 매치로 잘못 집어내지 않는다는 게 핵심.
    const md2 = '````mermaid\n%% caption: c\nflowchart LR\n  A --> B\n```mermaid\n  nested\n```\n````';
    const out2 = inlineDiagrams(md2);
    expect(out2).toBe(md2);
    expect(out2.match(/<svg/g)).toBeNull();
  });

  it('닫히지 않은 바깥 펜스 뒤로는 아무것도 변환되지 않는다', () => {
    // 바깥(````markdown)이 문서 끝까지 안 닫히면, 그 안에 있는 것처럼 보이는
    // ```mermaid 도 "진짜 펜스 열기"가 아니라 리터럴 텍스트다 — 문서 전체가
    // 그대로 남아야 한다.
    const md2 = '````markdown\n앞 설명\n```mermaid\n%% caption: c\nflowchart LR\n A-->B\n```\n뒤에 더 있음, 안 닫힘';
    expect(inlineDiagrams(md2)).toBe(md2);
  });

  it('캡션에 마크다운 특수문자가 있어도 그대로 낸다', () => {
    const out2 = inlineDiagrams('```mermaid\n%% caption: *bold* _em_ [link] # heading\nflowchart LR\n A-->B\n```');
    expect(out2).toContain('그림: *bold* _em_ [link] # heading');
  });

  it('캡션 주석만 있고 그림 본문이 없으면 실패를 돌려준다', () => {
    const r = renderDiagram('%% caption: just a caption');
    expect(r.svg).toBeNull();
    expect(r.caption).toBe('just a caption');
    expect(r.warnings.some((w) => w.includes('(빈 내용)'))).toBe(true);
  });

  it('같은 입력을 반복 호출해도 결과가 같다(lastIndex 누수 없음)', () => {
    const once = inlineDiagrams(FENCE);
    const twice = inlineDiagrams(FENCE);
    expect(once).toBe(twice);
    expect(once).toContain('id="d1-arrow"');
  });
});
