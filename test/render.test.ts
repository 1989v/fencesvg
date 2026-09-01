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

  it('알려진 한계: 다른 펜스 안에 예시로 감싼 mermaid 펜스도 그림으로 바뀐다', () => {
    // ````(4개 백틱)로 감싼 블록 안에 예시로 ```mermaid 를 "그대로 보여주려는"
    // 의도가 있어도, 이 라이브러리는 실제 CommonMark 블록 구조를 파싱하지
    // 않고 정규식으로 펜스 줄만 찾는다 — 안쪽 펜스가 그대로 그림으로 바뀐다.
    // 제로 의존성 제약 안에서 이 태스크 범위 밖(진짜 마크다운 블록 파서 필요).
    const nested = inlineDiagrams('````\n```mermaid\n%% caption: c\nflowchart LR\n A-->B\n```\n````');
    expect(nested).toContain('<svg');
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
