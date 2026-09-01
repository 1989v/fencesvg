import type { Dir } from '../layout/graph';

export type Shape = 'rect' | 'round' | 'diamond';
export type Line = 'solid' | 'dotted';

export type FlowNode = { id: string; label: string; shape: Shape };
export type FlowEdge = { from: string; to: string; label?: string; line: Line };
export type FlowModel = {
  kind: 'flowchart' | 'state';
  dir: Dir;
  nodes: FlowNode[];
  edges: FlowEdge[];
  emphasis: Set<string>;
  warnings: string[]; // 치명적이진 않지만 알려야 하는 것들(예: 강조 2개 이상)
};

export type ParseError = { error: string };
