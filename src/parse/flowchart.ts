import type { Dir } from '../layout/graph';
import type { FlowModel, FlowNode, FlowEdge, Group, ParseError, Shape, Line, Head } from './types';

const DIRS = new Set(['LR', 'RL', 'TD', 'BT', 'TB']);
// id[라벨] · id(라벨) · id{라벨} · id — id 는 유니코드 문자/숫자/밑줄만 허용한다.
// 하이픈은 뺐다: 공백 없는 화살표(`A-->B`)를 허용하면서 하이픈도 id 문자로
// 두면 `A-B-->C` 에서 하이픈이 화살표 몫인지 id 몫인지 구조적으로 안 갈린다.
// 화살표를 왼쪽에서 오른쪽으로 먼저 찾는 스캔(아래 tokenizeChain)이 하이픈을
// 전부 id 쪽에 남기므로, `A-B` 는 그 자체로 못 읽는 id 가 되어 에러로 끝난다
// — 조용히 잘못 쪼개지는 대신.
// 여는 괄호가 긴 것부터 시도한다 — `[[`·`([`·`[(`·`((`·`{{` 는 각각
// `[`·`(`·`{` 로도 매치되기 때문에 순서가 곧 의미다.
const NODE = /^([\p{L}\p{N}_]+)(?:\[\[([^\]]*)\]\]|\[\(([^)]*)\)\]|\(\(([^)]*)\)\)|\(\[([^\]]*)\]\)|\{\{([^}]*)\}\}|\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\})?$/u;

/** NODE 캡처 그룹 순서 → 모양. 인덱스는 정규식의 괄호 순서와 한 몸이다. */
const SHAPE_BY_GROUP: Shape[] = ['subroutine', 'cylinder', 'circle', 'stadium', 'hexagon', 'rect', 'round', 'diamond'];

// --> · -.-> · -->|라벨| · -.->|라벨| — 화살표 양옆 공백은 있어도 없어도 된다.
// -.-> 를 --> 보다 먼저 시도해야 점선의 첫 대시 두 개가 실선으로 잘못 잡히지
// 않는다. sticky(y) 라서 lastIndex 위치에서 시작하는 매치만 본다 — 한 줄을
// 왼쪽에서 오른쪽으로 훑으며 화살표를 찾고, 그 사이사이가 노드 토큰이다.
// `A --> B --> C` 같은 체인도 이 스캔 하나로 처리된다(화살표가 여럿이면
// 노드도 여럿). |라벨| 은 이 정규식 자체가 통째로 삼키므로 라벨 안의
// "-->" 같은 문자는(`A -->|a-->b| B`) 스캔 대상이 아니다 — 이미 안전하다.
// 선 3종(실선 `--` · 점선 `-.-` · 굵은선 `==`) × 끝 4종(`>` 화살표 · `o` 원 ·
// `x` 가위표 · 없음)에 양방향(`<`) 접두가 붙는다. 긴 것부터 시도해야 한다 —
// `-.->` 를 `-->` 보다, `<-->` 를 `-->` 보다 먼저 봐야 첫 글자들이 엉뚱한
// 갈래로 먹히지 않는다. |라벨| 은 이 정규식이 통째로 삼키므로 라벨 안의
// "-->" 는(`A -->|a-->b| B`) 스캔 대상이 아니다.
// 연결자 = 선택적 `<` + 선 몸통 + 선택적 끝(`>` `o` `x`).
//
// 몸통은 길이가 가변이다. mermaid 는 `-->` 와 `---->` 를 둘 다 받고(길이는
// 랭크 힌트라 우리 배치에는 영향이 없다), `---` 처럼 끝이 없으면 화살표 없는
// 연결선이다. 그래서 몸통을 고정 문자열로 잡으면 안 된다 — `-{2}` 로 잡았더니
// `---` 에서 남은 `-` 가 다음 노드 토큰에 붙어 파싱이 깨졌다.
//
// 점선은 `-.-` · `-..-` 처럼 점 개수가 는다. 굵은선은 `==` 이상.
const ARROW = /(<)?(-\.+-|-{2,}|={2,})(>|o|x)?\s*(?:\|([^|]*)\|)?\s*/y;

const HEAD_OF: Record<string, Head> = { '>': 'arrow', o: 'circle', x: 'cross' };

function lineOf(body: string): Line {
  if (body.includes('.')) return 'dotted';
  if (body.startsWith('=')) return 'thick';
  return 'solid';
}

function node(token: string): { node: FlowNode } | ParseError {
  const trimmed = token.trim();
  const m = NODE.exec(trimmed);
  if (!m) {
    // 하이픈은 화살표와 헷갈려 id 문자에서 뺐다(위 NODE 주석) — 실무에서
    // 가장 흔히 걸리는 이유이니 이유까지 알려준다. 대괄호가 섞인 토큰은
    // (안 닫힌 괄호처럼) 다른 이유로도 못 읽을 수 있으니 괄호가 하나도
    // 없을 때만 이 힌트를 붙인다 — 엉뚱한 원인을 짚지 않도록
    const bareId = !/[[({]/.test(trimmed);
    const reason = bareId && trimmed.includes('-')
      ? ' — id 에 쓸 수 있는 건 글자·숫자·_ 뿐이다(- 는 화살표와 헷갈려 id 문자에서 뺐다)'
      : '';
    return { error: `읽을 수 없는 노드: ${trimmed}${reason}` };
  }
  const id = m[1]!;
  let shape: Shape = 'rect';
  let label = id;
  for (let g = 0; g < SHAPE_BY_GROUP.length; g++) {
    const captured = m[g + 2];
    if (captured !== undefined) { shape = SHAPE_BY_GROUP[g]!; label = captured; break; }
  }
  return { node: { id, label, shape } };
}

/**
 * 한 줄을 화살표 기준으로 노드 토큰 N+1개·화살표 N개로 쪼갠다(체인 지원).
 * `[` `(` `{` 로 들어가고 `]` `)` `}` 로 나오는 깊이를 세어, 대괄호 안에서는
 * 화살표를 구분자로 보지 않는다 — 라벨 안에 있는 "-->" 는(공백이 있든
 * 없든) 파서가 들여다볼 대상이 아니라 사용자가 쓴 글자일 뿐이다. 대괄호가
 * 안 닫히면(`A[go --> B`) 깊이가 0으로 안 돌아와 나머지 줄이 통째로 한
 * 토큰이 되고, 그건 NODE 에 안 맞아 에러로 끝난다 — 그 이상 대괄호 짝을
 * 검증하지는 않는다.
 */
type ChainArrow = { line: Line; label?: string; head: Head; backHead?: Head };

function tokenizeChain(line: string): { tokens: string[]; arrows: ChainArrow[] } {
  const tokens: string[] = [];
  const arrows: ChainArrow[] = [];
  let segStart = 0;
  let depth = 0;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '[' || ch === '(' || ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === ']' || ch === ')' || ch === '}') {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (depth === 0) {
      ARROW.lastIndex = i;
      const m = ARROW.exec(line);
      if (m) {
        // 화살촉도 없고 양방향도 아닌 `-.-` 는 점선 연결선이다. `--` 하나만으로는
        // 화살표를 못 만드니(`-` 는 그냥 하이픈) 여기 오는 `--` 는 항상 `---` 이상이다.
        const kind = m[2]!;
        const head: Head = m[3] ? HEAD_OF[m[3]]! : 'none';
        tokens.push(line.slice(segStart, i));
        arrows.push({
          line: lineOf(kind),
          head,
          backHead: m[1] ? (head === 'none' ? 'arrow' : head) : undefined,
          label: m[4]?.trim() || undefined,
        });
        i += m[0].length;
        segStart = i;
        continue;
      }
    }
    i++;
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
  const warnings: string[] = [];
  // subgraph 는 중첩될 수 있다. 스택으로 열고 닫되, 안쪽에서 본 노드는
  // 바깥 그룹에도 속한다 — 테두리가 겹쳐 그려지는 게 맞다.
  const groupStack: Group[] = [];
  const groups: Group[] = [];
  const joined = (id: string) => { for (const g of groupStack) if (!g.members.includes(id)) g.members.push(id); };

  for (const raw of lines.slice(1)) {
    // 줄 끝 세미콜론(선택적 문 종결자)은 여기서 한 번만 벗긴다 — 중간 세미콜론은
    // 다루지 않는다(한 줄에 문 여러 개를 세미콜론으로 잇는 문법은 범위 밖)
    const line = raw.replace(/\s*;$/, '');
    if (line.startsWith('%%')) continue;
    // `subgraph 결제` · `subgraph pay[결제]` — id 만 쓰면 그게 곧 라벨이다.
    const sg = /^subgraph\s+(.+)$/.exec(line);
    if (sg) {
      const spec = sg[1]!.trim();
      const withLabel = /^([\p{L}\p{N}_]+)\s*\[([^\]]*)\]$/u.exec(spec);
      const id = withLabel ? withLabel[1]! : spec;
      const g: Group = { id, label: withLabel ? withLabel[2]! : spec, members: [] };
      groupStack.push(g);
      groups.push(g);
      continue;
    }
    if (line === 'end') {
      if (groupStack.length === 0) return { error: '짝 없는 end 가 있다' };
      groupStack.pop();
      continue;
    }
    // 방향 선언은 subgraph 안에서도 나온다 — 우리 배치는 전체 방향 하나만 쓰므로 무시한다.
    if (/^direction\s+\w+$/.test(line)) continue;

    if (/^class\s/.test(line)) {
      const [, ids, name] = /^class\s+([^\s]+)\s+(\w+)$/.exec(line) ?? [];
      if (ids && name === 'emphasis') {
        // 강조는 다이어그램당 최대 1개다 — 둘이면 초점이 사라진다. 첫 번째만
        // 받고 나머지는 경고로 남긴 뒤 무시한다(에러로 끝내지는 않는다).
        for (const rawId of ids.split(',')) {
          const id = rawId.trim();
          if (emphasis.size === 0) emphasis.add(id);
          else warnings.push(`강조는 다이어그램당 최대 1개다 — '${id}' 는 무시한다`);
        }
      }
      continue;
    }

    const { tokens, arrows } = tokenizeChain(line);
    if (arrows.length === 0) {
      const only = node(tokens[0] ?? '');
      if ('error' in only) return only;
      nodes.set(only.node.id, nodes.get(only.node.id) ?? only.node);
      joined(only.node.id);
      continue;
    }

    // 화살표가 N 개면 노드 토큰은 N+1 개다 — 선행 화살표(맨 앞이 빔)나
    // 후행 화살표(맨 뒤가 빔)는 빈 토큰이 된다. NODE 에도 안 맞긴 하지만
    // "읽을 수 없는 노드: " 처럼 빈 꼬리로 끝나는 메시지는 안 도와주므로
    // 화살표 쪽·방향까지 짚어 알려준다
    const chainNodes: FlowNode[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.trim() === '') {
        const side = i === 0 ? '앞' : '뒤';
        return { error: `화살표 ${side}에 노드가 없다: ${line}` };
      }
      const r = node(t);
      if ('error' in r) return r;
      chainNodes.push(r.node);
    }

    // 라벨을 가진 선언이 이기게 한다 — `A[주문] --> B` 뒤에 `A --> C` 가 와도 라벨이 남는다
    for (const n of chainNodes) {
      const prev = nodes.get(n.id);
      if (!prev || (prev.label === prev.id && n.label !== n.id)) nodes.set(n.id, n);
      joined(n.id);
    }
    for (let i = 0; i < arrows.length; i++) {
      edges.push({
        from: chainNodes[i]!.id,
        to: chainNodes[i + 1]!.id,
        label: arrows[i]!.label,
        line: arrows[i]!.line,
        head: arrows[i]!.head,
        backHead: arrows[i]!.backHead,
      });
    }
  }

  if (groupStack.length > 0) return { error: '닫히지 않은 subgraph 가 있다' };
  if (nodes.size === 0) return { error: '노드가 없다' };
  return {
    kind: 'flowchart', dir, nodes: [...nodes.values()], edges,
    groups: groups.filter((g) => g.members.length > 0), emphasis, warnings,
  };
}
