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
    const before = (md.match(/<(rect|polygon|polyline|path|text|marker)\b/g) ?? []).length;
    const after = (html.match(/<(rect|polygon|polyline|path|text|marker)\b/g) ?? []).length;
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
    const before = (md.match(/<(rect|polygon|polyline|path|text|marker)\b/g) ?? []).length;
    const after = (html.match(/<(rect|polygon|polyline|path|text|marker)\b/g) ?? []).length;
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
    // 커넥터는 이제 <polyline> 이 아니라 둥근 모서리 <path> 다.
    const before = (md.match(/<path\b/g) ?? []).length;
    const after = (html.match(/<path\b/g) ?? []).length;
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(before);
  });

  it('marker 참조가 끊기지 않는다', () => {
    expect(html).toMatch(/marker-end="url\(#d1-arrow\)"/);
  });

  it('블록이 정의되어 있다', () => {
    expect(html).toContain('<rect');
  });
});

// 다섯 타입 전부가 발행 경로(marked + DOMPurify)를 살아남는지 — 타입 하나가
// 새 태그를 쓰기 시작해도 이 게이트가 잡는다. flowchart 하나만 걸어 둔 위
// 스위트들은 도입 당시 나머지 네 타입이 아직 없어서였을 뿐이다.
const CASES: Record<string, string> = {
  flowchart: 'flowchart LR\n  A[주문] --> B{결제}',
  sequence: 'sequenceDiagram\n  주문->>결제: 요청\n  결제-->>주문: 승인',
  state: 'stateDiagram-v2\n  [*] --> PENDING\n  PENDING --> PAID: 승인',
  er: 'erDiagram\n  ORDER ||--o{ ITEM : contains',
  class: 'classDiagram\n  class Order {\n +Long id\n }\n  Order --> Payment',
};

describe.each(Object.entries(CASES))('%s 왕복', (_name, src) => {
  const md = inlineDiagrams('앞.\n\n```mermaid\n%% caption: 설명\n' + src + '\n```\n\n뒤.');
  const html = publish(md);

  it('도형이 하나도 안 사라진다', () => {
    const count = (s: string) => (s.match(/<(rect|polygon|polyline|path|line|circle|text|marker)\b/g) ?? []).length;
    expect(count(html)).toBe(count(md));
  });

  it('캡션이 남는다', () => {
    expect(html).toContain('<p>그림: 설명</p>');
  });
});

// 디자인 패스가 새로 낸 presentation 속성들 — sanitizer 가 낯선 속성이나 값을
// 조용히 지워도 다른 왕복 테스트는 태그 개수만 세서 못 잡는다. 속성 자체가,
// 그리고 var(--…) 를 품은 속성값이 실제로 살아남는지 이름을 짚어 확인한다.
describe('디자인 패스 — 새 presentation 속성이 sanitize 를 통과한다', () => {
  const flowHtml = publish(inlineDiagrams(
    '```mermaid\n%% caption: c\nflowchart LR\n  A[주문] -->|승인| B{결제}\n  class B emphasis\n```',
  ));
  // class 는 fill-opacity(멤버행) 와 --fs-radius 의 단위 없는 숫자 둘 다를 낸다.
  const classHtml = publish(inlineDiagrams(
    '```mermaid\n%% caption: c\nclassDiagram\n  class Order {\n +Long id\n }\n  Order --> Payment\n```',
  ));
  // sequence 의 생명선이 stroke-opacity(faint) 를 낸다.
  const seqHtml = publish(inlineDiagrams(
    '```mermaid\n%% caption: c\nsequenceDiagram\n  A->>A: 재시도\n```',
  ));

  it('var(--fs-…, fallback) 커스텀 프로퍼티 값이 살아남는다', () => {
    expect(flowHtml).toMatch(/="var\(--fs-[\w-]+, [^")]+\)"/);
  });

  it('강조 옵션이 --fs-accent 의 fallback 으로 살아남는다', () => {
    const html = publish(inlineDiagrams(
      '```mermaid\n%% caption: c\nflowchart LR\n  A[a] --> B[b]\n  class B emphasis\n```',
      { accent: 'var(--ko-accent-primary)' },
    ));
    expect(html).toContain('var(--fs-accent, var(--ko-accent-primary))');
  });

  it('rx 의 --fs-radius 는 단위 없는 숫자로 살아남는다(px 가 붙으면 SVG 에서 안 풀린다)', () => {
    expect(classHtml).toMatch(/rx="var\(--fs-radius, 6\)"/);
  });

  it('fill-opacity 가 살아남는다(클래스 멤버행)', () => {
    expect(classHtml).toMatch(/fill-opacity="[\d.]+"/);
  });

  // 예전에는 "stroke-opacity 가 살아남는다" 를 재고 있었다. 생명선이 그 속성을
  // 안 쓰게 된 지금 그 검사는 우리 출력이 아니라 DOMPurify 를 재는 것이 된다.
  // 대신 생명선이 사라졌던 원인 자체를 막는다 — 이미 알파가 든 색에
  // stroke-opacity 를 또 곱해 실효 0.019 가 됐었다(바탕 대비 2/255).
  it('생명선은 점선으로 남고 불투명도를 곱하지 않는다', () => {
    const lifeline = /<(?:line|path)[^>]*stroke-dasharray[^>]*>/.exec(seqHtml)?.[0] ?? '';
    expect(lifeline, '점선 생명선이 없다').not.toBe('');
    expect(lifeline, `생명선에 stroke-opacity 가 다시 붙었다: ${lifeline}`).not.toMatch(/stroke-opacity/);
  });

  it('font-weight 가 살아남는다(활자 위계)', () => {
    expect(flowHtml).toMatch(/font-weight="\d+"/);
  });

  it('<path d="…"> 가 살아남는다(둥근 커넥터)', () => {
    expect(flowHtml).toMatch(/<path d="[^"]+"/);
  });
});

describe('축소 하한과 가로 스크롤이 발행 경로를 지난다', () => {
  // `max-width: 100%` 만 있으면 좁은 화면에서 끝없이 줄어들어 글자가 같이
  // 작아진다(실측: 1012px 상태도가 704px 열에서 0.70배, 글자 11.1px).
  // min-width 는 CSS 우선순위에서 max-width 를 이기므로 고유 폭의 85% 를
  // 걸어 두면 그 아래로는 안 줄고 바깥 상자가 스크롤한다. 이 두 속성과
  // 래퍼가 sanitize 를 지나지 않으면 장치 전체가 조용히 무력해진다.
  const html = publish(inlineDiagrams(SRC));

  it('스크롤 래퍼가 남는다', () => {
    expect(html).toMatch(/<div[^>]*overflow-x:\s*auto/);
  });

  it('svg 에 min-width · max-width · height:auto 가 남는다', () => {
    const style = /<svg[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(style, `svg style: ${style}`).toMatch(/min-width:\d+px/);
    expect(style).toContain('max-width:100%');
    expect(style).toContain('height:auto');
  });

  it('하한은 고유 폭의 85% 다', () => {
    const w = Number(/<svg[^>]*\swidth="(\d+)"/.exec(html)?.[1]);
    const floor = Number(/min-width:(\d+)px/.exec(html)?.[1]);
    expect(w).toBeGreaterThan(0);
    expect(floor).toBe(Math.round(w * 0.85));
  });
});
