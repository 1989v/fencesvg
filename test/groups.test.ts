// subgraph · 중첩 상태 · 자기 루프.
//
// 테두리는 구성원의 경계 상자다. 그 안에 남의 노드가 들어가면 "이것도 이
// 그룹이다" 라는 틀린 말이 되므로 그때는 테두리를 포기하고 경고를 남긴다.
// 그 두 갈래를 둘 다 검사한다 — 한쪽만 보면 포기 경로가 죽은 코드가 된다.
import { describe, it, expect } from 'vitest';
import { parseFlowchart } from '../src/parse/flowchart';
import { renderDiagram } from '../src/render';
import { parseState } from '../src/parse/state';
import { drawFlowchart } from '../src/draw/flowchart';
import { drawState } from '../src/draw/state';
import { defaultTheme } from '../src/draw/theme';
import { framesFor } from '../src/draw/group';
import type { Placed } from '../src/layout/graph';

const okFlow = (src: string) => {
  const m = parseFlowchart(src);
  if ('error' in m) throw new Error(m.error);
  return m;
};

const FRAME = /stroke-dasharray="5 4"/g;

describe('subgraph', () => {
  const m = okFlow(`flowchart TD
  시작 --> 검증
  subgraph pay[결제 처리]
    검증 --> 승인
    승인 --> 정산
  end
  정산 --> 완료`);

  it('id 와 라벨을 갈라 읽는다', () => {
    expect(m.groups).toEqual([{ id: 'pay', label: '결제 처리', members: ['검증', '승인', '정산'] }]);
  });

  it('테두리와 라벨을 그린다', () => {
    const out = drawFlowchart(m, defaultTheme(), 'd', 'x');
    expect([...out.matchAll(FRAME)].length).toBe(1);
    expect(out).toContain('결제 처리');
  });

  it('테두리가 viewBox 안에 들어간다', () => {
    const out = drawFlowchart(m, defaultTheme(), 'd', 'x');
    const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(out)!.slice(1).map(Number) as number[];
    const over: string[] = [];
    for (const r of out.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const [x, y, w, h] = r.slice(1).map(Number) as number[];
      if (x! < vb[0]! - 0.5 || y! < vb[1]! - 0.5 || x! + w! > vb[0]! + vb[2]! + 0.5 || y! + h! > vb[1]! + vb[3]! + 0.5) {
        over.push(`rect(${x},${y})`);
      }
    }
    expect(over, `넘친 것: ${over.join(' ')}`).toEqual([]);
  });

  it('중첩 subgraph 는 안쪽 노드가 바깥 그룹에도 속한다', () => {
    const n = okFlow(`flowchart TD
  subgraph 밖
    subgraph 안
      A --> B
    end
    B --> C
  end`);
    expect(n.groups.find((g) => g.id === '안')!.members).toEqual(['A', 'B']);
    expect(n.groups.find((g) => g.id === '밖')!.members).toEqual(['A', 'B', 'C']);
  });

  it('빈 subgraph 는 그룹으로 안 남긴다', () => {
    expect(okFlow('flowchart LR\n subgraph 빈\n end\n A --> B').groups).toEqual([]);
  });
});

describe('테두리가 남의 노드를 삼키면 포기한다', () => {
  // 배치를 직접 만들어 "흩어진 그룹" 을 강제한다 — 배치 쪽이 붙여 놓으므로
  // 실제 그림에서 만들기 어렵지만, 포기 경로 자체는 살아 있어야 한다.
  const placed = new Map<string, Placed>([
    ['A', { id: 'A', x: 0, y: 0, w: 40, h: 20 }],
    ['남', { id: '남', x: 60, y: 0, w: 40, h: 20 }],
    ['B', { id: 'B', x: 120, y: 0, w: 40, h: 20 }],
  ]);

  it('삼키면 테두리 없이 경고만 남는다', () => {
    const r = framesFor([{ id: 'g', label: '그룹', members: ['A', 'B'] }], placed, defaultTheme());
    expect(r.frames).toEqual([]);
    expect(r.warnings[0]).toContain('남');
  });

  it('안 삼키면 테두리가 나온다', () => {
    const r = framesFor([{ id: 'g', label: '그룹', members: ['A', '남'] }], placed, defaultTheme());
    expect(r.frames).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });
});

describe('중첩 상태', () => {
  const m = parseState(`stateDiagram-v2
  [*] --> 대기
  state 처리중 {
    대기 --> 검증
    검증 --> 승인
  }
  승인 --> [*]`);

  it('그룹으로 읽는다', () => {
    if ('error' in m) throw new Error(m.error);
    expect(m.groups[0]).toMatchObject({ id: '처리중', label: '처리중' });
  });

  it('테두리를 그린다', () => {
    if ('error' in m) throw new Error(m.error);
    const out = drawState(m, defaultTheme(), 'd', 'x');
    expect([...out.matchAll(FRAME)].length).toBe(1);
    expect(out).toContain('처리중');
  });

  it('표시 이름이 따로 있으면 그것을 쓴다', () => {
    const n = parseState('stateDiagram-v2\n state "결제 처리" as pay {\n A --> B\n }');
    if ('error' in n) throw new Error(n.error);
    expect(n.groups[0]).toMatchObject({ id: 'pay', label: '결제 처리' });
  });
});

describe('자기 루프', () => {
  const m = okFlow('flowchart TD\n A --> B\n B --> B\n B --> C');

  it('간선으로 읽는다', () => {
    expect(m.edges.filter((e) => e.from === e.to)).toHaveLength(1);
  });

  it('길이 0 짜리 선을 만들지 않는다 — 고리로 그린다', () => {
    const out = drawFlowchart(m, defaultTheme(), 'd', 'x');
    const degenerate = out.split('\n').filter((l) => /^<path d="M ([\d.]+) ([\d.]+)"/.test(l));
    expect(degenerate).toEqual([]);
    expect(out).toMatch(/<path d="M [\d.]+ [\d.]+ L/);
  });

  it('자기 루프가 viewBox 위로 안 잘린다', () => {
    const out = drawFlowchart(m, defaultTheme(), 'd', 'x');
    const vb = /viewBox="([-\d.]+) ([-\d.]+)/.exec(out)!.slice(1).map(Number) as number[];
    const ys = [...out.matchAll(/<path d="M [\d.]+ ([-\d.]+)/g)].map((x) => Number(x[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(vb[1]! - 0.5);
  });
});

describe('작도가 낸 경고가 renderDiagram 까지 온다', () => {
  // 테두리를 포기했다는 사실은 배치가 끝나야 알 수 있어서 작도가
  // `model.warnings` 에 밀어 넣는다. render 가 그리기 **전에** 경고를
  // 펼치면 그 경고가 조용히 사라진다 — 실제로 그랬고, 화면에는 테두리가
  // 없는데 아무도 이유를 알 수 없었다.
  it('테두리를 포기하면 경고가 결과에 담긴다', () => {
    const r = renderDiagram(`%% caption: x
flowchart LR
  A --> B
  subgraph g[그룹]
    B --> C
    C --> D
  end
  C -.-> 남[남의 노드]
  D --> E`);
    expect(r.svg).not.toBeNull();
    const dropped = r.warnings.filter((w) => w.includes('테두리'));
    expect(dropped.length, `경고: ${r.warnings.join(' | ')}`).toBeGreaterThan(0);
  });

  it('테두리가 살아 있으면 그 경고는 없다', () => {
    const r = renderDiagram('%% caption: x\nflowchart LR\n A --> B\n subgraph g[그룹]\n B --> C\n end\n C --> D');
    expect(r.warnings.filter((w) => w.includes('테두리'))).toEqual([]);
    expect(r.svg).toContain('그룹');
  });
});
