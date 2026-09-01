import type { Dir } from '../layout/graph';
import type { FlowModel, FlowNode, FlowEdge, ParseError, Shape, Line } from './types';

const DIRS = new Set(['LR', 'RL', 'TD', 'BT', 'TB']);
// id[라벨] · id(라벨) · id{라벨} · id — id 는 유니코드 문자/숫자/밑줄만 허용한다.
// 하이픈은 뺐다: 공백 없는 화살표(`A-->B`)를 허용하면서 하이픈도 id 문자로
// 두면 `A-B-->C` 에서 하이픈이 화살표 몫인지 id 몫인지 구조적으로 안 갈린다.
// 화살표를 왼쪽에서 오른쪽으로 먼저 찾는 스캔(아래 tokenizeChain)이 하이픈을
// 전부 id 쪽에 남기므로, `A-B` 는 그 자체로 못 읽는 id 가 되어 에러로 끝난다
// — 조용히 잘못 쪼개지는 대신.
const NODE = /^([\p{L}\p{N}_]+)(?:\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\})?$/u;

// --> · -.-> · -->|라벨| · -.->|라벨| — 화살표 양옆 공백은 있어도 없어도 된다.
// -.-> 를 --> 보다 먼저 시도해야 점선의 첫 대시 두 개가 실선으로 잘못 잡히지
// 않는다. sticky(y) 라서 lastIndex 위치에서 시작하는 매치만 본다 — 한 줄을
// 왼쪽에서 오른쪽으로 훑으며 화살표를 찾고, 그 사이사이가 노드 토큰이다.
// `A --> B --> C` 같은 체인도 이 스캔 하나로 처리된다(화살표가 여럿이면
// 노드도 여럿).
//
// 이 스캔은 대괄호 안팎을 구분하지 않는다 — 라벨 안에 공백 없는 화살표가
// 있으면(`A[go-->ok]`) 그것도 구분자로 잡혀 잘못 쪼개진다. 대괄호를 아는
// 스캐너로 막을 수도 있지만 이번 요청은 "한 줄을 훑는 토크나이저 하나"였지
// 라벨 내부를 보호하는 문법 확장이 아니라 넓히지 않았다 — 잘못 쪼개진
// 반쪽은 NODE 에 안 맞아 여전히 에러로 끝난다(틀린 그래프가 아니라).
const ARROW = /(-\.->|-{2}>)\s*(?:\|([^|]*)\|)?\s*/y;

function node(token: string): { node: FlowNode } | ParseError {
  const m = NODE.exec(token.trim());
  if (!m) return { error: `읽을 수 없는 노드: ${token.trim()}` };
  const id = m[1]!;
  const shape: Shape = m[3] !== undefined ? 'round' : m[4] !== undefined ? 'diamond' : 'rect';
  const label = m[2] ?? m[3] ?? m[4] ?? id;
  return { node: { id, label, shape } };
}

/** 한 줄을 화살표 기준으로 노드 토큰 N+1개·화살표 N개로 쪼갠다(체인 지원). */
function tokenizeChain(line: string): { tokens: string[]; arrows: { line: Line; label?: string }[] } {
  const tokens: string[] = [];
  const arrows: { line: Line; label?: string }[] = [];
  let segStart = 0;
  let i = 0;
  while (i < line.length) {
    ARROW.lastIndex = i;
    const m = ARROW.exec(line);
    if (m) {
      tokens.push(line.slice(segStart, i));
      arrows.push({ line: m[1] === '-.->' ? 'dotted' : 'solid', label: m[2]?.trim() || undefined });
      i += m[0].length;
      segStart = i;
    } else {
      i++;
    }
  }
  tokens.push(line.slice(segStart));
  return { tokens, arrows };
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

  for (const raw of lines.slice(1)) {
    // 줄 끝 세미콜론(선택적 문 종결자)은 여기서 한 번만 벗긴다 — 중간 세미콜론은
    // 다루지 않는다(한 줄에 문 여러 개를 세미콜론으로 잇는 문법은 범위 밖)
    const line = raw.replace(/\s*;$/, '');
    if (line.startsWith('%%')) continue;
    if (/^subgraph\b/.test(line)) return { error: 'subgraph 는 아직 지원하지 않는다' };
    if (line === 'end') return { error: 'subgraph 는 아직 지원하지 않는다' };

    if (/^class\s/.test(line)) {
      const [, ids, name] = /^class\s+([^\s]+)\s+(\w+)$/.exec(line) ?? [];
      if (ids && name === 'emphasis') for (const id of ids.split(',')) emphasis.add(id.trim());
      continue;
    }

    const { tokens, arrows } = tokenizeChain(line);
    if (arrows.length === 0) {
      const only = node(tokens[0] ?? '');
      if ('error' in only) return only;
      nodes.set(only.node.id, nodes.get(only.node.id) ?? only.node);
      continue;
    }

    // 화살표가 N 개면 노드 토큰은 N+1 개다 — 선행 화살표(맨 앞이 빔)나
    // 후행 화살표(맨 뒤가 빔)는 빈 토큰이 NODE 에 안 맞아 자연히 에러가 된다
    const chainNodes: FlowNode[] = [];
    for (const t of tokens) {
      const r = node(t);
      if ('error' in r) return r;
      chainNodes.push(r.node);
    }

    // 라벨을 가진 선언이 이기게 한다 — `A[주문] --> B` 뒤에 `A --> C` 가 와도 라벨이 남는다
    for (const n of chainNodes) {
      const prev = nodes.get(n.id);
      if (!prev || (prev.label === prev.id && n.label !== n.id)) nodes.set(n.id, n);
    }
    for (let i = 0; i < arrows.length; i++) {
      edges.push({
        from: chainNodes[i]!.id,
        to: chainNodes[i + 1]!.id,
        label: arrows[i]!.label,
        line: arrows[i]!.line,
      });
    }
  }

  if (nodes.size === 0) return { error: '노드가 없다' };
  return { kind: 'flowchart', dir, nodes: [...nodes.values()], edges, emphasis };
}
