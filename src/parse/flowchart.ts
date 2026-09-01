import type { Dir } from '../layout/graph';
import type { FlowModel, FlowNode, FlowEdge, ParseError, Shape, Line } from './types';

const DIRS = new Set(['LR', 'RL', 'TD', 'BT', 'TB']);
// id[라벨] · id(라벨) · id{라벨} · id — id 는 ASCII 로 제한한다(라벨은 유니코드 허용)
const NODE = /^([A-Za-z0-9_-]+)(?:\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\})?$/;
// --> · -.-> · -->|라벨| · -.->|라벨| — 양옆에 공백이 있어야 매치한다.
// 라벨 안에 "a --> b" 처럼 공백을 낀 화살표가 있으면 거기서 먼저 매치되어
// 좌우가 깨진 토큰으로 쪼개지는데, 그 결과는 NODE 에 안 맞아 에러가 난다
// (실제로 chain 문법 `A --> B --> C` 도 같은 경로로 에러가 된다) — 자세한
// 파싱 대신 "못 읽으면 에러" 로 처리한다. 라벨 안 화살표를 공백 없이
// 붙이면(`A[go-->ok]`) 이 매치를 피해가므로 그 경우는 정상 동작한다.
const EDGE = /\s(-{2}>|-\.->)(?:\|([^|]*)\|)?\s/;

function node(token: string): { node: FlowNode } | ParseError {
  const m = NODE.exec(token.trim());
  if (!m) return { error: `읽을 수 없는 노드: ${token.trim()}` };
  const id = m[1]!;
  const shape: Shape = m[3] !== undefined ? 'round' : m[4] !== undefined ? 'diamond' : 'rect';
  const label = m[2] ?? m[3] ?? m[4] ?? id;
  return { node: { id, label, shape } };
}

export function parseFlowchart(src: string): FlowModel | ParseError {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const head = lines[0] ?? '';
  if (!/^flowchart\b/.test(head)) return { error: 'flowchart 선언으로 시작하지 않는다' };

  const declared = head.slice('flowchart'.length).trim().toUpperCase();
  const dir: Dir = declared === 'TB' ? 'TD' : (DIRS.has(declared) ? declared : 'LR') as Dir;

  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const emphasis = new Set<string>();

  for (const line of lines.slice(1)) {
    if (line.startsWith('%%')) continue;
    if (/^subgraph\b/.test(line)) return { error: 'subgraph 는 아직 지원하지 않는다' };
    if (line === 'end') return { error: 'subgraph 는 아직 지원하지 않는다' };

    if (/^class\s/.test(line)) {
      const [, ids, name] = /^class\s+([^\s]+)\s+(\w+)$/.exec(line) ?? [];
      if (ids && name === 'emphasis') for (const id of ids.split(',')) emphasis.add(id.trim());
      continue;
    }

    const m = EDGE.exec(` ${line} `);
    if (!m) {
      const only = node(line);
      if ('error' in only) return only;
      nodes.set(only.node.id, nodes.get(only.node.id) ?? only.node);
      continue;
    }

    const idx = ` ${line} `.indexOf(m[0]);
    const left = node(` ${line} `.slice(0, idx));
    const right = node(` ${line} `.slice(idx + m[0].length));
    if ('error' in left) return left;
    if ('error' in right) return right;

    // 라벨을 가진 선언이 이기게 한다 — `A[주문] --> B` 뒤에 `A --> C` 가 와도 라벨이 남는다
    for (const n of [left.node, right.node]) {
      const prev = nodes.get(n.id);
      if (!prev || (prev.label === prev.id && n.label !== n.id)) nodes.set(n.id, n);
    }
    edges.push({
      from: left.node.id,
      to: right.node.id,
      label: m[2]?.trim() || undefined,
      line: (m[1] === '-.->' ? 'dotted' : 'solid') as Line,
    });
  }

  if (nodes.size === 0) return { error: '노드가 없다' };
  return { kind: 'flowchart', dir, nodes: [...nodes.values()], edges, emphasis };
}
