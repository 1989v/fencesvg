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

  it('순수 순환 A↔B — 사용된 랭크가 {0,1} 이고 건너뛴 값이 없다', () => {
    const out = layoutGraph(
      [n('a'), n('b')],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
      'LR',
    );
    const used = new Set(out.rankOf.values());
    expect(used).toEqual(new Set([0, 1]));
  });

  it('역행 간선이 있어도 랭크에 빈 층이 없다 (S→A, A→B, B→A)', () => {
    const out = layoutGraph(
      [n('s'), n('a'), n('b')],
      [{ from: 's', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
      'LR',
    );
    const used = Array.from(new Set(out.rankOf.values())).sort((x, y) => x - y);
    expect(used).toEqual(Array.from({ length: used.length }, (_, i) => i));
  });

  it('고립 노드 + 분리된 순환 — 순환도 랭크가 매겨지고 고립 노드와 겹치지 않는다', () => {
    const out = layoutGraph(
      [n('x'), n('a'), n('b')],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
      'LR',
    );
    expect(out.rankOf.get('a')).not.toBe(out.rankOf.get('b'));
    const x = out.nodes.find((p) => p.id === 'x')!;
    const a = out.nodes.find((p) => p.id === 'a')!;
    const b = out.nodes.find((p) => p.id === 'b')!;
    // 이전 버그: 연결 성분이 나뉘어도 시작점을 전역에서 한 번만 심어 순환이 전혀
    // 방문되지 않았다 — 셋이 전부 랭크 0 에 쌓여 x 좌표가 같았다
    expect(x.x).not.toBe(a.x);
    expect(x.x).not.toBe(b.x);
  });

  it('고립 노드 + 분리된 순환 — 10회 실행해도 좌표가 완전히 같다', () => {
    const run = () => JSON.stringify(layoutGraph(
      [n('x'), n('a'), n('b')],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }], 'LR').nodes);
    const first = run();
    for (let i = 0; i < 9; i++) expect(run()).toBe(first);
  });
});
