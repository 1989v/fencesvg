import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import { inlineDiagrams } from '../src/index';

const purify = createDOMPurify(new JSDOM('').window);

// blog.1989v.com 의 실제 설정 (portal-fe/src/pages/blog/markdown.ts)
const publish = (md: string) =>
  purify.sanitize(marked.parse(md, { async: false, gfm: true, breaks: false }) as string, {
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
  });

const SRC = `설명 문장.

\`\`\`mermaid
%% caption: 주문은 결제 승인 뒤에 재고를 잡는다
flowchart LR
  A[주문] -->|승인| B{결제}
  B --> C(재고 예약)
  class C emphasis
\`\`\`

다음 문장.`;

describe('발행 경로 왕복', () => {
  const md = inlineDiagrams(SRC, { accent: 'var(--ko-accent-primary)' });
  const html = publish(md);

  it('svg 가 살아남는다', () => {
    expect(html).toContain('<svg');
  });

  it('도형이 하나도 안 사라진다', () => {
    const before = (md.match(/<(rect|polygon|polyline|text|marker)\b/g) ?? []).length;
    const after = (html.match(/<(rect|polygon|polyline|text|marker)\b/g) ?? []).length;
    expect(after).toBe(before);
  });

  it('marker 참조가 끊기지 않는다', () => {
    expect(html).toMatch(/id="d1-arrow"/);
    expect(html).toMatch(/marker-end="url\(#d1-arrow\)"/);
  });

  it('토큰 색이 살아남는다', () => {
    expect(html).toContain('var(--ko-accent-primary)');
    expect(html).toContain('currentColor');
  });

  it('캡션이 문단으로 남는다', () => {
    expect(html).toContain('<p>그림: 주문은 결제 승인 뒤에 재고를 잡는다</p>');
  });

  it('블록이 끊기지 않는다 — svg 뒤에 떠도는 도형이 없다', () => {
    expect(html).not.toMatch(/<\/svg>[\s\S]*<rect/);
  });

  it('앞뒤 문단이 보존된다', () => {
    expect(html).toContain('<p>설명 문장.</p>');
    expect(html).toContain('<p>다음 문장.</p>');
  });
});

describe('다중 다이어그램 marker 격리', () => {
  const multiSrc = `첫 번째 다이어그램:

\`\`\`mermaid
flowchart LR
  A[노드A] --> B[노드B]
\`\`\`

두 번째 다이어그램:

\`\`\`mermaid
flowchart LR
  C[노드C] --> D[노드D]
\`\`\``;

  const md = inlineDiagrams(multiSrc);
  const html = publish(md);

  it('d1, d2 id 프리픽스가 분리된다', () => {
    expect(html).toMatch(/id="d1-/);
    expect(html).toMatch(/id="d2-/);
  });

  it('marker 참조도 각각 분리된다', () => {
    expect(html).toMatch(/marker-end="url\(#d1-arrow\)"/);
    expect(html).toMatch(/marker-end="url\(#d2-arrow\)"/);
  });

  it('도형이 모두 보존된다', () => {
    const before = (md.match(/<(rect|polygon|polyline|text|marker)\b/g) ?? []).length;
    const after = (html.match(/<(rect|polygon|polyline|text|marker)\b/g) ?? []).length;
    expect(after).toBe(before);
  });
});

describe('사이클이 있는 다이어그램', () => {
  const cycleSrc = `그래프 예제:

\`\`\`mermaid
flowchart LR
  A[시작] --> B[처리]
  B --> C{결정}
  C -->|예| A
  C -->|아니오| D[종료]
\`\`\``;

  const md = inlineDiagrams(cycleSrc);
  const html = publish(md);

  it('사이클이 있어도 svg 가 살아남는다', () => {
    expect(html).toContain('<svg');
  });

  it('백엣지(역방향)가 보존된다', () => {
    const before = (md.match(/<polyline/g) ?? []).length;
    const after = (html.match(/<polyline/g) ?? []).length;
    expect(after).toBeGreaterThan(0);
  });

  it('marker 참조가 끊기지 않는다', () => {
    expect(html).toMatch(/marker-end="url\(#d1-arrow\)"/);
  });

  it('블록이 정의되어 있다', () => {
    expect(html).toContain('<rect');
  });
});
