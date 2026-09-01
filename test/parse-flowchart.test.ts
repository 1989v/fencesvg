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

  it('%% 주석을 건너뛴다', () => {
    expect(ok('flowchart LR\n %% caption: 설명\n A[a] --> B[b]').nodes).toHaveLength(2);
  });

  it('subgraph 는 아직 못 읽는다고 알린다', () => {
    const m = parseFlowchart('flowchart LR\n subgraph s\n A --> B\n end');
    expect(m).toHaveProperty('error');
    expect((m as { error: string }).error).toMatch(/subgraph/);
  });

  it('flowchart 가 아니면 오류다', () => {
    expect(parseFlowchart('sequenceDiagram\n A->>B: x')).toHaveProperty('error');
  });
});

// EDGE 정규식은 화살표 양옆의 공백으로만 간선을 찾는다 — 라벨 안에 공백을
// 낀 화살표가 있거나 체인 문법처럼 이 정규식이 못 다루는 모양이 오면,
// 잘못 쪼개진 반쪽이 NODE 정규식에 안 맞아 조용히 틀린 그래프 대신
// 에러로 끝난다. 아래는 그 경계를 고정해 두는 테스트다.
describe('parseFlowchart — 문법 경계', () => {
  it('라벨 안의 화살표(공백 포함)는 잘못 쪼개져 에러가 된다', () => {
    const m = parseFlowchart('flowchart LR\n A[a --> b] --> B');
    expect(m).toHaveProperty('error');
  });

  it('라벨 안 화살표라도 공백이 없으면 그대로 라벨로 읽힌다', () => {
    expect(ok('flowchart LR\n A[go-->ok] --> B[b]').nodes[0]!.label).toBe('go-->ok');
  });

  it('한 줄 체인(A --> B --> C)은 아직 지원하지 않아 에러다', () => {
    const m = parseFlowchart('flowchart LR\n A --> B --> C');
    expect(m).toHaveProperty('error');
  });

  it('id 는 ASCII 로 제한된다 — id 에 쓴 한글은 에러다(라벨은 허용)', () => {
    const m = parseFlowchart('flowchart LR\n 주문 --> 배송');
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

  it('줄 끝 세미콜론은 지원 범위 밖이라 에러다(문법을 몰래 넓히지 않는다)', () => {
    const m = parseFlowchart('flowchart LR\n A --> B;');
    expect(m).toHaveProperty('error');
  });
});
