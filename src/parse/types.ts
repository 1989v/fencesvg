import type { Dir } from '../layout/graph';

// mermaid 의 노드 모양. 겉모습이 겹치는 것끼리 합치지 않는다 — 원문이
// `((원))` 인지 `([스타디움])` 인지는 글쓴이가 고른 의미라, 같은 알약으로
// 뭉개면 되돌릴 수 없다.
export type Shape =
  | 'rect'        // [사각형]
  | 'round'       // (둥근 모서리)
  | 'stadium'     // ([스타디움])
  | 'subroutine'  // [[서브루틴]]
  | 'cylinder'    // [(저장소)]
  | 'circle'      // ((원))
  | 'diamond'     // {판단}
  | 'hexagon';    // {{육각형}}

export type Line = 'solid' | 'dotted' | 'thick';
/** 화살촉. `none` 은 화살표 없는 연결선(`---`), `circle`·`cross` 는 `--o`·`--x`. */
export type Head = 'none' | 'arrow' | 'circle' | 'cross';

export type FlowNode = { id: string; label: string; shape: Shape };
export type FlowEdge = { from: string; to: string; label?: string; line: Line; head: Head; backHead?: Head };
/** `subgraph`(흐름도) · `state X { }`(상태도) · `namespace`(클래스도) 는
 * 표기만 다를 뿐 "이 노드들을 한 테두리로 묶는다" 는 같은 것이다. */
export type Group = { id: string; label: string; members: string[] };

export type FlowModel = {
  kind: 'flowchart' | 'state';
  dir: Dir;
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups: Group[];
  emphasis: Set<string>;
  warnings: string[]; // 치명적이진 않지만 알려야 하는 것들(예: 강조 2개 이상)
};

export type ParseError = { error: string };
