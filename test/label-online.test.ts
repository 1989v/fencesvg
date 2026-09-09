import { describe, it, expect } from 'vitest';
import { cutPathAtBox, labelChipBox } from '../src/draw/label';
import { EDITORIAL } from '../src/draw/theme';
import { renderDiagram } from '../src/index';

describe('cutPathAtBox — 라벨 칩 자리에서 선을 끊는다', () => {
  it('가로선 한가운데 상자가 있으면 두 조각이 되고, 상자 안(여유 2px 포함)은 비어 있다', () => {
    const pieces = cutPathAtBox([{ x: 0, y: 0 }, { x: 100, y: 0 }], { minX: 40, maxX: 60, minY: -5, maxY: 5 });
    expect(pieces).toEqual([[{ x: 0, y: 0 }, { x: 38, y: 0 }], [{ x: 62, y: 0 }, { x: 100, y: 0 }]]);
  });

  it('상자와 안 만나면 원래 경로 하나다', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(cutPathAtBox(path, { minX: 40, maxX: 60, minY: 20, maxY: 30 })).toEqual([path]);
  });

  it('꺾인 지점이 상자 안에 있으면 꺾임까지 통째로 빠진다', () => {
    const pieces = cutPathAtBox([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }], { minX: 40, maxX: 60, minY: -10, maxY: 10 });
    expect(pieces).toEqual([[{ x: 0, y: 0 }, { x: 38, y: 0 }], [{ x: 50, y: 12 }, { x: 50, y: 100 }]]);
  });
});

describe('labelChipBox — 붙는 방식', () => {
  it('on: 칩이 선을 위아래로 감싼다', () => {
    const b = labelChipBox('승인', 50, 20, EDITORIAL, 'middle', 'on');
    expect(b.minY).toBeLessThan(20);
    expect(b.maxY).toBeGreaterThan(20);
  });
  it('above: 칩 전체가 선 위에 있다', () => {
    const b = labelChipBox('승인', 50, 20, EDITORIAL, 'middle', 'above');
    expect(b.maxY).toBeLessThan(20);
  });
});

/** `d="M x y L x y …"` 에서 숫자를 뽑아 [x,y] 쌍으로 */
const coords = (d: string) => { const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number); const out: [number, number][] = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i]!, n[i + 1]!]); return out; };

describe('그려진 간선 — 라벨이 있으면 선이 두 조각이고 칩이 그 사이에 있다', () => {
  const svg = renderDiagram('%% caption: t\nflowchart LR\n  A[가] -->|승인| B[나]', { idPrefix: 'x' }).svg!;
  const paths = [...svg.matchAll(/<path d="([^"]+)"[^>]*>/g)].filter((m) => !m[0].includes('<defs') && !m[0].includes('marker'));
  const ds = [...svg.matchAll(/<path d="([^"]+)"([^>]*)>/g)].map((m) => ({ d: m[1]!, attrs: m[2]! })).filter((p) => !p.attrs.includes('points'));
  const chip = /<rect x="([^"]+)" y="[^"]+" width="([^"]+)" height="[^"]+" rx="3"/.exec(svg)!;

  it('간선 path 가 두 개다 — 화살촉은 두 번째에만', () => {
    const edgePaths = ds.filter((p) => p.attrs.includes('stroke='));
    expect(edgePaths).toHaveLength(2);
    expect(edgePaths[0]!.attrs).not.toContain('marker-end');
    expect(edgePaths[1]!.attrs).toContain('marker-end');
  });

  it('첫 조각의 끝 < 칩 왼쪽, 칩 오른쪽 < 둘째 조각의 시작', () => {
    const edgePaths = ds.filter((p) => p.attrs.includes('stroke='));
    const endOfFirst = coords(edgePaths[0]!.d).at(-1)![0];
    const startOfSecond = coords(edgePaths[1]!.d)[0]![0];
    const chipL = Number(chip[1]), chipR = chipL + Number(chip[2]);
    expect(endOfFirst).toBeLessThan(chipL);
    expect(startOfSecond).toBeGreaterThan(chipR);
    void paths;
  });

  it('칩이 선 높이를 감싼다 (라벨이 선 위에 앉는다)', () => {
    const edgePaths = ds.filter((p) => p.attrs.includes('stroke='));
    const lineY = coords(edgePaths[0]!.d).at(-1)![1];
    const chipY = Number(/<rect x="[^"]+" y="([^"]+)"/.exec(svg)![1]);
    const chipH = Number(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="([^"]+)"/.exec(svg)![1]);
    expect(chipY).toBeLessThan(lineY);
    expect(chipY + chipH).toBeGreaterThan(lineY);
  });
});

describe('chooseLabelT — 가로 구간을 먼저 고른다', () => {
  it('세로-가로-세로 경로에서 라벨은 가로 구간 위에 놓인다', async () => {
    const { chooseLabelT, pointAtFraction } = await import('../src/draw/label');
    // 세로 구간이 길어 비율 후보(0.4 …)는 전부 세로 위에 떨어진다 — 가로 우선이 없으면 빨간불
    const path = [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 80, y: 200 }, { x: 80, y: 400 }];
    const t = chooseLabelT(path, '라벨', EDITORIAL, []);
    expect(pointAtFraction(path, t).y).toBe(200);
  });
});

describe('layoutGraph — 라벨이 앉을 자리만큼 층 사이를 벌린다', () => {
  it('need 가 기본 간격보다 크면 그 사이만 벌어지고, 작으면 기본 간격이다', async () => {
    const { layoutGraph } = await import('../src/layout/graph');
    const nodes = [{ id: 'A', w: 100, h: 40 }, { id: 'B', w: 100, h: 40 }, { id: 'C', w: 100, h: 40 }];
    const edges = [{ from: 'A', to: 'B', need: 200 }, { from: 'B', to: 'C', need: 10 }];
    const lay = layoutGraph(nodes, edges, 'LR', { rank: 56, node: 24 }, undefined, (e) => (e as { need: number }).need);
    const at = new Map(lay.nodes.map((n) => [n.id, n]));
    expect(at.get('B')!.x - (at.get('A')!.x + 100)).toBe(200);
    expect(at.get('C')!.x - (at.get('B')!.x + 100)).toBe(56);
  });
});

describe('layoutGraph — 세로 흐름에서는 라벨 수만큼 층 사이가 쌓인다', () => {
  it('stackNeed 는 합산되고(셋까지), need 는 최댓값이다', async () => {
    const { layoutGraph } = await import('../src/layout/graph');
    const nodes = ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, w: 100, h: 40 }));
    const edges = [{ from: 'A', to: 'E', s: 30 }, { from: 'B', to: 'E', s: 30 }, { from: 'C', to: 'E', s: 30 }, { from: 'D', to: 'E', s: 30 }];
    const lay = layoutGraph(nodes, edges, 'TD', { rank: 56, node: 24 }, undefined, undefined, (e) => (e as { s: number }).s);
    const at = new Map(lay.nodes.map((n) => [n.id, n]));
    expect(at.get('E')!.y - (at.get('A')!.y + 40)).toBe(90);
  });
});
