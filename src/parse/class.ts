import type { ParseError } from './types';

export type ClassRel = 'inherit' | 'implement' | 'assoc' | 'depend' | 'compose' | 'aggregate' | 'link';
export type ClassModel = {
  kind: 'class';
  /** `generic` 은 `Repo~T~` 의 `T`, `stereotype` 은 `<<interface>>` 의 `interface`. */
  classes: { id: string; members: string[]; generic?: string; stereotype?: string }[];
  rels: {
    from: string; to: string; rel: ClassRel; label?: string;
    /** 관계선 양 끝의 개수 표기(`"1"` · `"0..*"`). 원문 순서 그대로다. */
    fromCard?: string; toCard?: string;
  }[];
};

// A<|--B : label — 화살표 양옆 공백은 있어도 없어도 된다(flowchart·state 와
// 같은 넓혀진 문법). id 는 유니코드 문자/숫자/밑줄만 허용한다(하이픈은
// 화살표와 헷갈려 뺀다).
// UML 관계 12종. 양 끝에 개수 표기("1" · "0..*")가 붙을 수 있다.
// 연결자를 긴 것부터 나열해야 `<|--` 가 `--` 로, `--|>` 가 `--` 로 잘못 먹히지 않는다.
const CONNECTORS = [
  '<|--', '--|>', '<|..', '..|>',
  '*--', '--*', 'o--', '--o',
  '-->', '<--', '..>', '<..',
  '--', '..',
] as const;
// 유니코드 모드 정규식은 모르는 이스케이프를 거부한다 — `\<` `\>` 는 오류다.
// 정규식에서 뜻이 있는 `| . *` 만 이스케이프한다.
const CONNECTOR_ALT = CONNECTORS.map((c) => c.replace(/[|.*]/g, (ch) => `\\${ch}`)).join('|');
const REL = new RegExp(
  `^([\\p{L}\\p{N}_~]+)\\s*(?:"([^"]*)"\\s*)?(${CONNECTOR_ALT})\\s*(?:"([^"]*)"\\s*)?([\\p{L}\\p{N}_~]+)(?:\\s*:\\s*(.+))?$`,
  'u',
);

const KIND: Record<string, ClassRel> = {
  '<|--': 'inherit', '--|>': 'inherit',
  '<|..': 'implement', '..|>': 'implement',
  '*--': 'compose', '--*': 'compose',
  'o--': 'aggregate', '--o': 'aggregate',
  '-->': 'assoc', '<--': 'assoc',
  '..>': 'depend', '<..': 'depend',
  '--': 'link', '..': 'link',
};
/**
 * `from` 은 화살표 **꼬리**, `to` 는 **머리**로 정규화한다.
 * `A <|-- B` 는 "B 가 A 를 상속" 이라 머리가 A 다 — 표기 순서와 반대다.
 * 이걸 정규화해 두면 작도가 관계 종류별 예외 없이 한 방향으로만 그린다.
 */
// 왼쪽을 가리키는 연결자(`<` 로 시작하거나 `*`·`o` 가 왼쪽에 붙은 것)는
// 표기 순서와 화살표 방향이 반대다.
const TAIL_IS_RIGHT = new Set(['<|--', '<|..', '*--', 'o--', '<--', '<..']);

/** `Repo~T~` 를 이름과 타입 인자로 가른다. */
const GENERIC = /^([\p{L}\p{N}_]+)~([^~]+)~$/u;
const STEREOTYPE = /^<<([^>]+)>>$/;

export function parseClass(src: string): ClassModel | ParseError {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!/^classDiagram\b/.test(lines[0] ?? '')) return { error: 'classDiagram 선언으로 시작하지 않는다' };

  const classes = new Map<string, ClassModel['classes'][number]>();
  const rels: ClassModel['rels'] = [];
  let open: string | null = null;

  const ensure = (id: string) => {
    if (!classes.has(id)) classes.set(id, { id, members: [] });
    return classes.get(id)!;
  };
  /** `Repo~T~` 에서 이름만. 관계 줄에서도 제네릭 표기를 그대로 쓸 수 있다. */
  const strip = (token: string) => GENERIC.exec(token)?.[1] ?? token;
  /** 토큰을 클래스로 등록하고 이름을 돌려준다. 제네릭이면 타입 인자도 싣는다. */
  const declare = (token: string) => {
    const g = GENERIC.exec(token);
    const id = g?.[1] ?? token;
    const c = ensure(id);
    if (g) c.generic = g[2]!.trim();
    return id;
  };

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\s*;$/, '');
    if (line.startsWith('%%')) continue;
    if (/^namespace\b/.test(line)) return { error: '네임스페이스는 아직 지원하지 않는다' };

    if (open) {
      if (line === '}') { open = null; continue; }
      // 블록 안의 `<<interface>>` 는 멤버가 아니라 클래스에 붙는 표식이다.
      const st = STEREOTYPE.exec(line);
      if (st) { ensure(open).stereotype = st[1]!.trim(); continue; }
      ensure(open).members.push(line);
      continue;
    }

    // `class Repo~T~ {` · `class Repo~T~` — 제네릭은 이름에서 갈라 따로 담는다.
    const decl = /^class\s+([\p{L}\p{N}_~]+)\s*\{$/u.exec(line);
    if (decl) { open = declare(decl[1]!); continue; }

    const bare = /^class\s+([\p{L}\p{N}_~]+)$/u.exec(line);
    if (bare) { declare(bare[1]!); continue; }

    // `Repo : <<interface>>` — 블록 없이 표식만 붙이는 형태.
    const marked = /^([\p{L}\p{N}_~]+)\s*:\s*<<([^>]+)>>$/u.exec(line);
    if (marked) { ensure(strip(marked[1]!)).stereotype = marked[2]!.trim(); continue; }

    const m = REL.exec(line);
    if (!m) return { error: `읽을 수 없는 줄: ${line}` };
    const [, rawLeft, leftCard, arrow, rightCard, rawRight, label] = m;
    const left = declare(rawLeft!), right = declare(rawRight!);
    const flip = TAIL_IS_RIGHT.has(arrow!);
    rels.push({
      from: flip ? right : left,
      to: flip ? left : right,
      rel: KIND[arrow!]!,
      label: label?.trim() || undefined,
      fromCard: (flip ? rightCard : leftCard)?.trim() || undefined,
      toCard: (flip ? leftCard : rightCard)?.trim() || undefined,
    });
  }

  if (open) return { error: '닫히지 않은 클래스 블록이 있다' };
  if (classes.size === 0) return { error: '클래스가 없다' };
  return { kind: 'class', classes: [...classes.values()], rels };
}
