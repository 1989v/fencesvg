// @vitest-environment jsdom
//
// 이 파일은 자기만의 jsdom 문서를 쓴다(vitest 는 환경을 파일 단위로 격리한다,
// describe 단위가 아니라) — test/auto.test.ts 가 이미 자기 document.body 에
// 링크를 심어 두므로, "링크가 하나도 없는 페이지" 를 같은 파일에서 검증하면
// sampleAction 의 document 전체 폴백이 그 링크를 주워 EDITORIAL 로 안 내려간다.
// 실제 브라우저는 document 가 페이지당 하나뿐이라 이 충돌 자체가 없다 — 순전히
// 한 파일 안에서 두 개의 "페이지" 를 동시에 검증하려던 테스트 쪽의 문제였다.
import { describe, it, expect } from 'vitest';
import { detectTheme } from '../src/auto';
import { parseFlowchart } from '../src/parse/flowchart';
import { drawFlowchart } from '../src/draw/flowchart';
import { defaultTheme, EDITORIAL } from '../src/draw/theme';

describe('감지가 아무것도 못 찾으면 EDITORIAL 로 내려간다', () => {
  it('링크도(강조를 칠할 색이 없다) 배경도(전부 투명) 없는 페이지는 EDITORIAL 을 그대로 돌려준다', () => {
    // 아무 스타일도 안 준 맨 body — 배경은 조상을 끝까지 올라가도 불투명한 곳이
    // 없고(전부 투명), 링크도 하나도 없다.
    expect(detectTheme(document.body)).toBe(EDITORIAL);
  });
});

describe('EDITORIAL 의 강조는 색이 아니라 굵기로 구별된다', () => {
  it('강조 노드의 테두리·라벨이 평범한 노드보다 뚜렷이 굵다', () => {
    const model = parseFlowchart('flowchart LR\n A[a] --> B[b]\n class B emphasis');
    if ('error' in model) throw new Error(model.error);
    const svg = drawFlowchart(model, defaultTheme(), 'd1', '설명');
    expect(svg).toContain('stroke-width="1.75"'); // 강조 테두리
    expect(svg).toContain('font-weight="700"');    // 강조 라벨
    expect(svg).toContain('stroke-width="1"');     // 평범한 노드 테두리
    expect(svg).toContain('font-weight="600"');    // 평범한 노드 라벨
  });
});
