import { describe, it, expect } from 'vitest';
import { renderDiagram } from '../src/index';

const CASES: Record<string, string> = {
  'flowchart-기본': '%% caption: 설명\nflowchart LR\n  A[주문] -->|승인| B{결제}\n  B --> C(재고)\n  class C emphasis',
  'flowchart-TD': '%% caption: 설명\nflowchart TD\n  A[a] --> B[b]\n  A --> C[c]',
  'flowchart-점선': '%% caption: 설명\nflowchart LR\n  A[a] -.-> B[b]',
  'sequence-기본': '%% caption: 설명\nsequenceDiagram\n  주문->>결제: 요청\n  결제-->>주문: 승인',
  'sequence-노트': '%% caption: 설명\nsequenceDiagram\n  A->>B: x\n  Note over B: 검증한다',
  'state-기본': '%% caption: 설명\nstateDiagram-v2\n  [*] --> PENDING\n  PENDING --> PAID: 승인\n  PAID --> [*]',
  'er-기본': '%% caption: 설명\nerDiagram\n  ORDER ||--o{ ITEM : contains',
  'class-기본': '%% caption: 설명\nclassDiagram\n  class Order {\n +Long id\n +pay()\n  }\n  Order --> Payment : uses',
};

describe.each(Object.entries(CASES))('스냅샷: %s', (_name, src) => {
  it('출력이 고정된다', () => {
    const r = renderDiagram(src, { idPrefix: 'd1' });
    expect(r.warnings).toHaveLength(0);
    expect(r.svg).toMatchSnapshot();
  });
});
