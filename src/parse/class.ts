import type { ParseError } from './types';

export type ClassRel = 'inherit' | 'implement' | 'assoc' | 'depend';
export type ClassModel = {
  kind: 'class';
  classes: { id: string; members: string[] }[];
  rels: { from: string; to: string; rel: ClassRel; label?: string }[];
};

// A<|--B : label — 화살표 양옆 공백은 있어도 없어도 된다(flowchart·state 와
// 같은 넓혀진 문법). id 는 유니코드 문자/숫자/밑줄만 허용한다(하이픈은
// 화살표와 헷갈려 뺀다).
const REL = /^([\p{L}\p{N}_]+)\s*(<\|--|<\|\.\.|-->|\.\.>)\s*([\p{L}\p{N}_]+)(?:\s*:\s*(.+))?$/u;
const KIND: Record<string, ClassRel> = {
  '<|--': 'inherit', '<|..': 'implement', '-->': 'assoc', '..>': 'depend',
};
/**
 * `from` 은 화살표 **꼬리**, `to` 는 **머리**로 정규화한다.
 * `A <|-- B` 는 "B 가 A 를 상속" 이라 머리가 A 다 — 표기 순서와 반대다.
 * 이걸 정규화해 두면 작도가 관계 종류별 예외 없이 한 방향으로만 그린다.
 */
const TAIL_IS_RIGHT = new Set(['<|--', '<|..']);

export function parseClass(src: string): ClassModel | ParseError {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!/^classDiagram\b/.test(lines[0] ?? '')) return { error: 'classDiagram 선언으로 시작하지 않는다' };

  const classes = new Map<string, { id: string; members: string[] }>();
  const rels: ClassModel['rels'] = [];
  let open: string | null = null;

  const ensure = (id: string) => {
    if (!classes.has(id)) classes.set(id, { id, members: [] });
    return classes.get(id)!;
  };

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\s*;$/, '');
    if (line.startsWith('%%')) continue;
    if (/^namespace\b/.test(line)) return { error: '네임스페이스는 아직 지원하지 않는다' };

    if (open) {
      if (line === '}') { open = null; continue; }
      ensure(open).members.push(line);
      continue;
    }

    const decl = /^class\s+([\p{L}\p{N}_]+)\s*\{$/u.exec(line);
    if (decl) { open = decl[1]!; ensure(open); continue; }

    const bare = /^class\s+([\p{L}\p{N}_]+)$/u.exec(line);
    if (bare) { ensure(bare[1]!); continue; }

    const m = REL.exec(line);
    if (!m) return { error: `읽을 수 없는 줄: ${line}` };
    const [, left, arrow, right, label] = m;
    ensure(left!); ensure(right!);
    const tail = TAIL_IS_RIGHT.has(arrow!) ? right! : left!;
    const head = TAIL_IS_RIGHT.has(arrow!) ? left! : right!;
    rels.push({ from: tail, to: head, rel: KIND[arrow!]!, label: label?.trim() || undefined });
  }

  if (open) return { error: '닫히지 않은 클래스 블록이 있다' };
  if (classes.size === 0) return { error: '클래스가 없다' };
  return { kind: 'class', classes: [...classes.values()], rels };
}
