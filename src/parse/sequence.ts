import type { ParseError } from './types';

export type SeqStep =
  | { t: 'msg'; from: string; to: string; label: string; line: 'solid' | 'dotted' }
  | { t: 'note'; at: string; label: string };

export type SeqModel = { kind: 'sequence'; actors: string[]; steps: SeqStep[] };

// A->>B: label · A-->>B: label — id 는 유니코드 문자/숫자/밑줄만 허용한다
// (flowchart 의 NODE 규칙과 동일, 하이픈은 화살표와 헷갈려 제외). 화살표
// 양옆 공백은 있어도 없어도 된다. `-->>` 를 먼저 시도하지 않아도 되는 이유 —
// `->>` 는 대시 하나만 허용하므로 대시 두 개짜리 입력에서는 애초에 안 걸린다.
const MSG = /^([\p{L}\p{N}_]+)\s*(-->>|->>)\s*([\p{L}\p{N}_]+)\s*:\s*(.*)$/u;
const NOTE = /^Note\s+(?:over|right of|left of)\s+([^:]+):\s*(.*)$/i;
const BLOCK = /^(alt|else|opt|loop|par|rect|activate|deactivate|end)\b/;

export function parseSequence(src: string): SeqModel | ParseError {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!/^sequenceDiagram\b/.test(lines[0] ?? '')) return { error: 'sequenceDiagram 선언으로 시작하지 않는다' };

  const actors: string[] = [];
  const steps: SeqStep[] = [];
  const see = (name: string) => { if (!actors.includes(name)) actors.push(name); };

  for (const raw of lines.slice(1)) {
    // 줄 끝 세미콜론(선택적 문 종결자)은 여기서 한 번만 벗긴다 — flowchart 와 동일
    const line = raw.replace(/\s*;$/, '');
    if (line.startsWith('%%')) continue;
    if (BLOCK.test(line)) return { error: `${line.split(/\s/)[0]} 블록은 아직 지원하지 않는다` };

    const p = /^(?:participant|actor)\s+(.+)$/.exec(line);
    if (p) { see(p[1]!.trim()); continue; }

    const n = NOTE.exec(line);
    if (n) {
      // `Note over A,B: ...` 처럼 둘을 걸치는 표기도 있지만 v1 은 첫 참가자
      // 위에만 놓는다 — 두 참가자 사이 중앙 배치는 이 태스크 범위 밖이다.
      const at = n[1]!.trim().split(',')[0]!.trim();
      see(at);
      steps.push({ t: 'note', at, label: n[2]!.trim() });
      continue;
    }

    const m = MSG.exec(line);
    if (!m) return { error: `읽을 수 없는 줄: ${line}` };
    const from = m[1]!.trim(), to = m[3]!.trim();
    see(from); see(to);
    steps.push({ t: 'msg', from, to, label: m[4]!.trim(), line: m[2] === '-->>' ? 'dotted' : 'solid' });
  }

  if (actors.length === 0) return { error: '참가자가 없다' };
  return { kind: 'sequence', actors, steps };
}
