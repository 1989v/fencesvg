import { describe, it, expect } from 'vitest';
import { parseFlowchart } from '../src/parse/flowchart';

const ok = (src: string) => {
  const m = parseFlowchart(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

describe('parseFlowchart', () => {
  it('방향을 읽는다', () => {
    expect(ok('flowchart TD\n A[a] --> B[b]').dir).toBe('TD');
  });

  it('방향이 없으면 LR 이다', () => {
    expect(ok('flowchart\n A[a] --> B[b]').dir).toBe('LR');
  });

  it('상자 모양 3종을 읽는다', () => {
    const m = ok('flowchart LR\n A[네모] --> B(둥근)\n B --> C{마름모}');
    expect(m.nodes.map((n) => n.shape)).toEqual(['rect', 'round', 'diamond']);
    expect(m.nodes.map((n) => n.label)).toEqual(['네모', '둥근', '마름모']);
  });

  it('간선 라벨을 읽는다', () => {
    expect(ok('flowchart LR\n A[a] -->|승인| B[b]').edges[0]!.label).toBe('승인');
  });

  it('점선을 구분한다', () => {
    const m = ok('flowchart LR\n A[a] -.-> B[b]');
    expect(m.edges[0]!.line).toBe('dotted');
  });

  it('라벨 없이 id 만 쓰면 id 가 라벨이다', () => {
    expect(ok('flowchart LR\n A --> B').nodes[0]!.label).toBe('A');
  });

  it('같은 노드를 여러 번 써도 하나다', () => {
    const m = ok('flowchart LR\n A[a] --> B[b]\n A --> C[c]');
    expect(m.nodes).toHaveLength(3);
  });

  it('class 로 강조를 표시한다', () => {
    expect(ok('flowchart LR\n A[a] --> B[b]\n class B emphasis').emphasis.has('B')).toBe(true);
  });

  it('강조는 다이어그램당 최대 1개 — 두 번째부터는 무시하고 경고를 남긴다', () => {
    const m = ok('flowchart LR\n A[a] --> B[b] --> C[c]\n class A emphasis\n class B emphasis');
    expect(m.emphasis.size).toBe(1);
    expect(m.emphasis.has('A')).toBe(true);
    expect(m.emphasis.has('B')).toBe(false);
    expect(m.warnings.some((w) => w.includes('B'))).toBe(true);
  });

  it('한 줄에 콤마로 여럿을 강조해도 최대 1개만 받는다', () => {
    const m = ok('flowchart LR\n A[a] --> B[b]\n class A,B emphasis');
    expect(m.emphasis.size).toBe(1);
    expect(m.emphasis.has('A')).toBe(true);
    expect(m.warnings.length).toBe(1);
  });

  it('%% 주석을 건너뛴다', () => {
    expect(ok('flowchart LR\n %% caption: 설명\n A[a] --> B[b]').nodes).toHaveLength(2);
  });

  it('subgraph 를 그룹으로 읽는다', () => {
    const m = parseFlowchart('flowchart LR\n subgraph 결제\n A --> B\n end\n B --> C');
    if ('error' in m) throw new Error(m.error);
    expect(m.groups).toEqual([{ id: '결제', label: '결제', members: ['A', 'B'] }]);
  });

  it('짝 없는 end 는 알린다', () => {
    expect(parseFlowchart('flowchart LR\n A --> B\n end')).toHaveProperty('error');
  });

  it('flowchart 가 아니면 오류다', () => {
    expect(parseFlowchart('sequenceDiagram\n A->>B: x')).toHaveProperty('error');
  });
});

// 화살표 스캐너는 한 줄을 왼쪽에서 오른쪽으로 훑어 --> · -.-> 를 찾는다.
// 양옆 공백은 있어도 없어도 되고, 화살표가 여럿이면 체인이 된다. 대괄호·
// 소괄호·중괄호로 들어간 깊이 안에서는 화살표를 구분자로 보지 않으므로,
// 라벨 안의 "-->" 는(공백이 있든 없든) 파서가 침범하지 않는다 — 대괄호가
// 안 닫힌 경우에만(진짜 못 읽는 문법) NODE 정규식에 안 맞아 에러로 끝난다.
// 아래는 그 경계를 고정해 두는 테스트다.
describe('parseFlowchart — 문법 경계', () => {
  it('공백 없는 화살표도 공백 있는 화살표와 같은 그래프를 만든다', () => {
    const spaced = ok('flowchart LR\n A --> B');
    for (const src of ['flowchart LR\n A-->B', 'flowchart LR\n A--> B', 'flowchart LR\n A -->B']) {
      const m = ok(src);
      expect(m.nodes).toEqual(spaced.nodes);
      expect(m.edges).toEqual(spaced.edges);
    }
  });

  it('공백 없는 화살표에 라벨을 바로 붙여도 읽는다', () => {
    expect(ok('flowchart LR\n A-->|승인|B').edges[0]!.label).toBe('승인');
  });

  it('공백 없는 점선도 구분한다', () => {
    expect(ok('flowchart LR\n A-.->B').edges[0]!.line).toBe('dotted');
    expect(ok('flowchart LR\n A -.-> B').edges[0]!.line).toBe('dotted');
  });

  it('id 는 유니코드를 허용한다 — 한글 id 도 그대로 읽는다', () => {
    const m = ok('flowchart LR\n 주문 --> 결제');
    expect(m.nodes.map((n) => n.id)).toEqual(['주문', '결제']);
    expect(m.nodes.map((n) => n.label)).toEqual(['주문', '결제']);
  });

  it('한글 id 에 라벨을 붙여도 읽는다', () => {
    const m = ok('flowchart LR\n 주문[주문서] --> 결제');
    const order = m.nodes.find((n) => n.id === '주문')!;
    expect(order.label).toBe('주문서');
  });

  it('한 줄 체인(A --> B --> C)은 간선 두 개·노드 세 개로 읽는다', () => {
    const m = ok('flowchart LR\n A --> B --> C');
    expect(m.nodes).toHaveLength(3);
    expect(m.edges.map((e) => [e.from, e.to])).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ]);
  });

  it('줄 끝 세미콜론은 벗겨 내고 읽는다', () => {
    const m = ok('flowchart LR\n A --> B;');
    expect(m.edges).toHaveLength(1);
  });

  it('하이픈은 더 이상 id 문자가 아니다 — A-B 는 에러다(이유도 알려준다)', () => {
    const m = parseFlowchart('flowchart LR\n A-B --> C');
    expect(m).toHaveProperty('error');
    expect((m as { error: string }).error).toMatch(/글자.*숫자.*_/);
  });

  it('뒤에 노드 없는 화살표는 에러다(뭐가 빠졌는지 알려준다)', () => {
    const m = parseFlowchart('flowchart LR\n A -->');
    expect(m).toHaveProperty('error');
    expect((m as { error: string }).error).toMatch(/화살표.*노드가 없다/);
  });

  it('앞에 노드 없는 화살표도 에러다(뭐가 빠졌는지 알려준다)', () => {
    const m = parseFlowchart('flowchart LR\n --> B');
    expect(m).toHaveProperty('error');
    expect((m as { error: string }).error).toMatch(/화살표.*노드가 없다/);
  });

  it('대괄호 안 화살표는 공백이 있어도 구분자로 안 잡힌다 — 라벨로 읽힌다', () => {
    const m = ok('flowchart LR\n A[a --> b] --> B');
    expect(m.nodes[0]!.label).toBe('a --> b');
    expect(m.edges.map((e) => [e.from, e.to])).toEqual([['A', 'B']]);
  });

  it('대괄호 안 화살표는 공백이 없어도 구분자로 안 잡힌다 — 라벨로 읽힌다', () => {
    const m = ok('flowchart LR\n A[go-->ok] --> B[b]');
    expect(m.nodes[0]!.label).toBe('go-->ok');
    expect(m.edges.map((e) => [e.from, e.to])).toEqual([['A', 'B']]);
  });

  it('소괄호·중괄호 라벨 안 화살표도 구분자로 안 잡힌다', () => {
    const round = ok('flowchart LR\n A(고객-->주문) --> B');
    expect(round.nodes[0]!.label).toBe('고객-->주문');
    expect(round.nodes[0]!.shape).toBe('round');

    const diamond = ok('flowchart LR\n A{조건-->값} --> B');
    expect(diamond.nodes[0]!.label).toBe('조건-->값');
    expect(diamond.nodes[0]!.shape).toBe('diamond');
  });

  it('간선 라벨(|...|) 안의 화살표 문자는 원래도 안전했다 — 회귀 확인', () => {
    expect(ok('flowchart LR\n A -->|a-->b| B').edges[0]!.label).toBe('a-->b');
  });

  it('대괄호가 안 닫히면 여전히 에러다(대괄호 짝은 안 봐 주지 않는다)', () => {
    const m = parseFlowchart('flowchart LR\n A[go --> B');
    expect(m).toHaveProperty('error');
  });

  it('빈 라벨 A[] 은 에러가 아니라 빈 문자열 라벨이다', () => {
    expect(ok('flowchart LR\n A[] --> B[b]').nodes[0]!.label).toBe('');
  });

  it('같은 노드를 다른 모양으로 다시 선언해도 먼저 붙은 라벨(과 그 모양)이 이긴다', () => {
    const m = ok('flowchart LR\n A[사각] --> B[b]\n A(둥근) --> C[c]');
    const a = m.nodes.find((n) => n.id === 'A')!;
    expect(a.shape).toBe('rect');
    expect(a.label).toBe('사각');
  });

  it('기본 라벨(id 그대로)로 먼저 나온 노드는 나중에 라벨 붙은 선언으로 갱신된다', () => {
    const m = ok('flowchart LR\n A --> B\n A[라벨] --> C');
    const a = m.nodes.find((n) => n.id === 'A')!;
    expect(a.label).toBe('라벨');
  });

  it('CRLF · 탭 들여쓰기를 허용한다', () => {
    const m = ok('flowchart LR\r\n\tA[a] --> B[b]\r\n');
    expect(m.nodes).toHaveLength(2);
  });
});
