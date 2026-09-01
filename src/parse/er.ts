import type { ParseError } from './types';

export type Card = 'one' | 'many' | 'zeroOne' | 'zeroMany';
/** 식별 관계(`--`)는 실선, 비식별(`..`)은 점선이다. */
export type RelLine = 'solid' | 'dotted';
export type ErRel = {
  from: string; to: string; fromCard: Card; toCard: Card; label?: string; line: RelLine;
};
/** 속성 한 줄. `keys` 는 PK·FK·UK 를 원문 순서대로 담는다. */
export type ErAttr = { type: string; name: string; keys: string[]; comment?: string };
export type ErEntity = { id: string; attrs: ErAttr[] };
export type ErModel = { kind: 'er'; entities: ErEntity[]; rels: ErRel[] };

// ORDER ||--o{ ITEM : contains — id 는 유니코드 문자/숫자/밑줄만 허용한다
// (flowchart·state 와 같은 이유로 하이픈은 뺐다). 카디널리티 토큰 자체는
// 붙여 쓰는 고정폭 문법(`||--o{`)이라 화살표처럼 공백 유무를 따질 여지가
// 없다 — 넓힐 대상은 id 문자 집합과 끝 세미콜론뿐이다.
const REL = /^([\p{L}\p{N}_]+)\s+([|}o][|o{]?)(--|\.\.)([|{o][|o{]?)\s+([\p{L}\p{N}_]+)\s*:\s*(.*)$/u;

const LEFT: Record<string, Card> = { '||': 'one', '|o': 'zeroOne', '}o': 'zeroMany', '}|': 'many' };
const RIGHT: Record<string, Card> = { '||': 'one', 'o|': 'zeroOne', 'o{': 'zeroMany', '|{': 'many' };

// `ORDER {` — 속성 블록을 연다.
const OPEN = /^([\p{L}\p{N}_]+)\s*\{$/u;
// `string name PK "설명"` — 타입과 이름은 필수, 키 표기와 주석은 선택이다.
// 키는 여러 개 붙을 수 있다(`PK, FK` 처럼 콤마를 쓰기도 해서 콤마도 받는다).
const ATTR = /^([\p{L}\p{N}_[\]<>]+)\s+([\p{L}\p{N}_]+)((?:\s*,?\s*(?:PK|FK|UK))*)\s*(?:"([^"]*)")?$/u;
const KEY = /PK|FK|UK/g;

export function parseEr(src: string): ErModel | ParseError {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!/^erDiagram\b/.test(lines[0] ?? '')) return { error: 'erDiagram 선언으로 시작하지 않는다' };

  const entities = new Map<string, ErEntity>();
  const rels: ErRel[] = [];
  const ensure = (id: string) => {
    if (!entities.has(id)) entities.set(id, { id, attrs: [] });
    return entities.get(id)!;
  };
  let open: string | null = null;

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\s*;$/, '');
    if (line.startsWith('%%')) continue;

    if (open) {
      if (line === '}') { open = null; continue; }
      const a = ATTR.exec(line);
      if (!a) return { error: `읽을 수 없는 속성: ${line}` };
      ensure(open).attrs.push({
        type: a[1]!,
        name: a[2]!,
        keys: a[3]!.match(KEY) ?? [],
        comment: a[4]?.trim() || undefined,
      });
      continue;
    }

    const o = OPEN.exec(line);
    if (o) { open = o[1]!; ensure(open); continue; }

    const m = REL.exec(line);
    if (!m) return { error: `읽을 수 없는 줄: ${line}` };

    const [, from, l, , r, to, rawLabel] = m;
    const fromCard = LEFT[l!];
    const toCard = RIGHT[r!];
    if (!fromCard || !toCard) return { error: `읽을 수 없는 카디널리티: ${l}--${r}` };

    ensure(from!); ensure(to!);
    const label = rawLabel!.trim().replace(/^"|"$/g, '');
    rels.push({ from: from!, to: to!, fromCard, toCard, label: label || undefined, line: m[3] === '..' ? 'dotted' : 'solid' });
  }

  if (open) return { error: '닫히지 않은 속성 블록이 있다' };
  if (entities.size === 0) return { error: '엔티티가 없다' };
  return { kind: 'er', entities: [...entities.values()], rels };
}
