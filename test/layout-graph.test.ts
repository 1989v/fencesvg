import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../src/layout/graph';

const n = (id: string) => ({ id, w: 100, h: 40 });

describe('layoutGraph', () => {
  it('LR 에서 후행 노드가 오른쪽에 온다', () => {
    const out = layoutGraph([n('a'), n('b')], [{ from: 'a', to: 'b' }], 'LR');
    const a = out.nodes.find((p) => p.id === 'a')!;
    const b = out.nodes.find((p) => p.id === 'b')!;
    expect(b.x).toBeGreaterThan(a.x);
    expect(out.rankOf.get('b')).toBe(1);
  });

  it('TD 에서 후행 노드가 아래에 온다', () => {
    const out = layoutGraph([n('a'), n('b')], [{ from: 'a', to: 'b' }], 'TD');
    expect(out.nodes.find((p) => p.id === 'b')!.y)
      .toBeGreaterThan(out.nodes.find((p) => p.id === 'a')!.y);
  });

  it('RL 은 LR 을 뒤집은 좌표다', () => {
    const lr = layoutGraph([n('a'), n('b')], [{ from: 'a', to: 'b' }], 'LR');
    const rl = layoutGraph([n('a'), n('b')], [{ from: 'a', to: 'b' }], 'RL');
    expect(rl.nodes.find((p) => p.id === 'b')!.x)
      .toBeLessThan(rl.nodes.find((p) => p.id === 'a')!.x);
    expect(rl.width).toBe(lr.width);
  });

  it('같은 랭크의 형제는 겹치지 않는다', () => {
    const out = layoutGraph(
      [n('a'), n('b'), n('c')],
      [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }],
      'LR',
    );
    const b = out.nodes.find((p) => p.id === 'b')!;
    const c = out.nodes.find((p) => p.id === 'c')!;
    expect(Math.abs(b.y - c.y)).toBeGreaterThanOrEqual(40);
  });

  it('가장 긴 경로가 랭크를 정한다', () => {
    const out = layoutGraph(
      [n('a'), n('b'), n('c')],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c' }],
      'LR',
    );
    expect(out.rankOf.get('c')).toBe(2);
  });

  it('순환이 있어도 끝난다', () => {
    const out = layoutGraph(
      [n('a'), n('b')],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
      'LR',
    );
    expect(out.nodes).toHaveLength(2);
  });

  it('간선 없는 노드도 배치된다', () => {
    const out = layoutGraph([n('a')], [], 'LR');
    expect(out.nodes).toHaveLength(1);
    expect(out.width).toBeGreaterThan(0);
  });

  it('결정적이다 — 같은 입력이 같은 좌표를 낸다', () => {
    const run = () => JSON.stringify(layoutGraph(
      [n('a'), n('b'), n('c')],
      [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }], 'LR').nodes);
    expect(run()).toBe(run());
  });
});
