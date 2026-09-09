import { describe, it, expect } from 'vitest';
import { renderDiagram } from '../src/index';

const frames = (svg: string) => (svg.match(/stroke-dasharray="5 4"/g) ?? []).length;

describe('subgraph 테두리 — 배치가 남의 노드를 묶음 밖으로 민다', () => {
  // 실측(§01): NODE 묶음이 층 2~4 에 걸쳐 있고, 층 4 의 비구성원 `결과` 가 구성원
  // 옆에 놓여 묶음의 경계 상자 안에 들어갔다 → 침입 가드가 테두리를 포기해 4개 중 3개만 그려졌다.
  const src = `%% caption: t
flowchart TB
  subgraph SRC[원천]
    A1[a1]
    A2[a2]
  end
  subgraph NODE[노드]
    B[배치]
    OS[(색인)]
    S[앱]
    E[인코더]
    QV[(캐시)]
  end
  A1 --> B
  A2 --> S
  U((쿼리)) --> S
  B --> OS
  S --> E
  E --> QV
  QV --> S
  S --> OS
  OS --> R((결과))`;
  const r = renderDiagram(src, { idPrefix: 'g' });

  it('테두리를 포기했다는 경고가 없고 묶음 2개가 다 그려진다', () => {
    expect(r.warnings.filter((w) => w.includes('테두리'))).toEqual([]);
    expect(frames(r.svg!)).toBe(2);
  });
});

describe('subgraph 테두리 — 위아래로 붙은 묶음의 테두리가 서로 겹치지 않는다', () => {
  // 실측: 랭크 간격을 56 으로 줄이자 아래 묶음의 제목이 위 묶음의 점선 테두리에 눌렸다.
  const src = `%% caption: t
flowchart TB
  subgraph X[위]
    A[a]
  end
  subgraph Y[아래]
    B[b]
  end
  A --> B`;
  const r = renderDiagram(src, { idPrefix: 'g' });
  const rects = [...r.svg!.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*stroke-dasharray="5 4"/g)]
    .map((m) => ({ y: +m[2]!, h: +m[4]! })).sort((a, b) => a.y - b.y);

  it('묶음이 둘이고 아래 묶음의 위변이 위 묶음의 아래변보다 4px 이상 아래다', () => {
    expect(rects).toHaveLength(2);
    expect(rects[1]!.y).toBeGreaterThanOrEqual(rects[0]!.y + rects[0]!.h + 4);
  });
});
