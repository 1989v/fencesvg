import type { ParseError } from './types';

export type Card = 'one' | 'many' | 'zeroOne' | 'zeroMany';
export type ErRel = { from: string; to: string; fromCard: Card; toCard: Card; label?: string };
export type ErModel = { kind: 'er'; entities: { id: string }[]; rels: ErRel[] };

// ORDER ||--o{ ITEM : contains — id 는 유니코드 문자/숫자/밑줄만 허용한다
// (flowchart·state 와 같은 이유로 하이픈은 뺐다). 카디널리티 토큰 자체는
// 붙여 쓰는 고정폭 문법(`||--o{`)이라 화살표처럼 공백 유무를 따질 여지가
// 없다 — 넓힐 대상은 id 문자 집합과 끝 세미콜론뿐이다.
const REL = /^([\p{L}\p{N}_]+)\s+([|}o][|o{]?)(--|\.\.)([|{o][|o{]?)\s+([\p{L}\p{N}_]+)\s*:\s*(.*)$/u;

const LEFT: Record<string, Card> = { '||': 'one', '|o': 'zeroOne', '}o': 'zeroMany', '}|': 'many' };
const RIGHT: Record<string, Card> = { '||': 'one', 'o|': 'zeroOne', 'o{': 'zeroMany', '|{': 'many' };

export function parseEr(src: string): ErModel | ParseError {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!/^erDiagram\b/.test(lines[0] ?? '')) return { error: 'erDiagram 선언으로 시작하지 않는다' };

  const entities = new Map<string, { id: string }>();
  const rels: ErRel[] = [];

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\s*;$/, '');
    if (line.startsWith('%%')) continue;
    if (line.endsWith('{') || line === '}') return { error: '속성 블록은 아직 지원하지 않는다' };

    const m = REL.exec(line);
    if (!m) return { error: `읽을 수 없는 줄: ${line}` };

    const [, from, l, , r, to, rawLabel] = m;
    const fromCard = LEFT[l!];
    const toCard = RIGHT[r!];
    if (!fromCard || !toCard) return { error: `읽을 수 없는 카디널리티: ${l}--${r}` };

    entities.set(from!, { id: from! });
    entities.set(to!, { id: to! });
    const label = rawLabel!.trim().replace(/^"|"$/g, '');
    rels.push({ from: from!, to: to!, fromCard, toCard, label: label || undefined });
  }

  if (entities.size === 0) return { error: '엔티티가 없다' };
  return { kind: 'er', entities: [...entities.values()], rels };
}
