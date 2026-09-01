import type { FlowModel, FlowNode, FlowEdge, ParseError } from './types';

// PENDING-->PAID: 승인 · [*] --> PENDING — 화살표 양옆 공백은 있어도 없어도 된다
// (flowchart 와 같은 넓혀진 문법). id 는 유니코드 문자/숫자/밑줄만 허용한다
// (하이픈은 화살표와 헷갈려 뺀다 — flowchart 파서와 같은 이유).
const TRANSITION = /^(\[\*\]|[\p{L}\p{N}_]+)\s*-->\s*(\[\*\]|[\p{L}\p{N}_]+)(?:\s*:\s*(.+))?$/u;

export function parseState(src: string): FlowModel | ParseError {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!/^stateDiagram(-v2)?\b/.test(lines[0] ?? '')) return { error: 'stateDiagram 선언으로 시작하지 않는다' };

  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
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
    if (/^state\s/.test(line) || line === '}') return { error: '중첩 상태는 아직 지원하지 않는다' };

    const m = TRANSITION.exec(line);
    if (!m) return { error: `읽을 수 없는 줄: ${line}` };

    const [, rawFrom, rawTo, label] = m;
    const from = rawFrom === '[*]' ? terminal() : rawFrom!;
    const to = rawTo === '[*]' ? terminal() : rawTo!;
    for (const id of [from, to]) {
      if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: 'round' });
    }
    edges.push({ from, to, label: label?.trim() || undefined, line: 'solid' });
  }

  if (nodes.size === 0) return { error: '상태가 없다' };
  return { kind: 'state', dir: 'LR', nodes: [...nodes.values()], edges, emphasis: new Set(), warnings: [] };
}
