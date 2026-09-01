import type { FlowModel, FlowNode, FlowEdge, Group, ParseError } from './types';

// PENDING-->PAID: 승인 · [*] --> PENDING — 화살표 양옆 공백은 있어도 없어도 된다
// (flowchart 와 같은 넓혀진 문법). id 는 유니코드 문자/숫자/밑줄만 허용한다
// (하이픈은 화살표와 헷갈려 뺀다 — flowchart 파서와 같은 이유).
const TRANSITION = /^(\[\*\]|[\p{L}\p{N}_]+)\s*-->\s*(\[\*\]|[\p{L}\p{N}_]+)(?:\s*:\s*(.+))?$/u;

export function parseState(src: string): FlowModel | ParseError {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!/^stateDiagram(-v2)?\b/.test(lines[0] ?? '')) return { error: 'stateDiagram 선언으로 시작하지 않는다' };

  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const groupStack: Group[] = [];
  const groups: Group[] = [];
  const joined = (id: string) => { for (const g of groupStack) if (!g.members.includes(id)) g.members.push(id); };
  let terminals = 0;

  // [*] 는 나올 때마다 다른 노드다 — 시작과 종료를 한 점으로 합치면 그래프가 순환이 된다
  const terminal = (): string => {
    const id = `__t${++terminals}`;
    nodes.set(id, { id, label: '', shape: 'round' });
    return id;
  };

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\s*;$/, '');
    if (line.startsWith('%%')) continue;
    // `state 처리중 { ... }` — 중첩 상태는 테두리로 묶는다.
    // `state "표시 이름" as ID {` 형태도 받는다.
    const open = /^state\s+(?:"([^"]*)"\s+as\s+([\p{L}\p{N}_]+)|([\p{L}\p{N}_]+))\s*\{$/u.exec(line);
    if (open) {
      const id = open[2] ?? open[3]!;
      groupStack.push({ id, label: open[1] ?? id, members: [] });
      groups.push(groupStack[groupStack.length - 1]!);
      continue;
    }
    if (line === '}') {
      if (groupStack.length === 0) return { error: '짝 없는 } 가 있다' };
      groupStack.pop();
      continue;
    }
    // 병렬 영역 구분자. 우리 배치는 영역을 나란히 두지 않으므로 테두리만 남기고 넘어간다.
    if (line === '--') continue;
    // `state X <<choice>>` 같은 표식 선언은 노드만 만들고 모양은 기본으로 둔다.
    const marked = /^state\s+([\p{L}\p{N}_]+)\s*<<[^>]+>>$/u.exec(line);
    if (marked) {
      const id = marked[1]!;
      if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: 'diamond' });
      joined(id);
      continue;
    }
    // 노트는 상태도 배치의 일부가 아니다 — 조용히 건너뛴다(에러로 끝내지 않는다).
    if (/^note\b/i.test(line) || line.toLowerCase() === 'end note') continue;

    const m = TRANSITION.exec(line);
    if (!m) return { error: `읽을 수 없는 줄: ${line}` };

    const [, rawFrom, rawTo, label] = m;
    const from = rawFrom === '[*]' ? terminal() : rawFrom!;
    const to = rawTo === '[*]' ? terminal() : rawTo!;
    for (const id of [from, to]) {
      if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: 'round' });
      joined(id);
    }
    edges.push({ from, to, label: label?.trim() || undefined, line: 'solid', head: 'arrow' });
  }

  if (groupStack.length > 0) return { error: '닫히지 않은 state 블록이 있다' };
  if (nodes.size === 0) return { error: '상태가 없다' };
  return {
    kind: 'state', dir: 'LR', nodes: [...nodes.values()], edges,
    groups: groups.filter((g) => g.members.length > 0), emphasis: new Set(), warnings: [],
  };
}
