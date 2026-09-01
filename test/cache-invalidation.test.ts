// @vitest-environment jsdom
//
// 자기만의 jsdom 문서를 쓴다(파일 단위 격리) — 다른 auto/editorial 테스트의
// document 상태와 안 섞이게.
import { describe, it, expect } from 'vitest';
import { detectTheme, paletteKey } from '../src/auto';

describe('테마 토글 후 재감지 — 같은 엘리먼트, 바뀐 팔레트', () => {
  it('배경·잉크·강조가 전부 바뀌면 두 번째 감지 결과가 첫 번째와 달라야 한다', () => {
    document.body.style.backgroundColor = 'rgb(249, 248, 242)';
    document.body.style.color = 'rgb(29, 29, 31)';
    document.body.innerHTML = '<a href="/x">link</a>';
    const link = document.body.querySelector('a') as HTMLElement;
    link.style.color = 'rgb(26, 71, 42)';

    const light = detectTheme(document.body);

    // data-theme 토글로 다크 모드 CSS 가 걸린 것을 흉내낸다 — 같은 엘리먼트,
    // 같은 WeakMap 키, 다른 팔레트.
    document.body.style.backgroundColor = 'rgb(19, 19, 19)';
    document.body.style.color = 'rgb(230, 230, 230)';
    link.style.color = 'rgb(90, 200, 140)';

    const dark = detectTheme(document.body);

    expect(dark.nodeFill).not.toBe(light.nodeFill);
    expect(dark.labelChip).not.toBe(light.labelChip);
    expect(dark.ink).not.toBe(light.ink);
    expect(dark.accent).not.toBe(light.accent);
  });
});

describe('paletteKey', () => {
  it('팔레트가 바뀌면 값이 바뀐다', () => {
    document.body.style.backgroundColor = 'rgb(249, 248, 242)';
    document.body.style.color = 'rgb(29, 29, 31)';
    document.body.innerHTML = '<a href="/x">link</a>';
    const link = document.body.querySelector('a') as HTMLElement;
    link.style.color = 'rgb(26, 71, 42)';

    const before = paletteKey(document.body);

    document.body.style.backgroundColor = 'rgb(19, 19, 19)';

    const after = paletteKey(document.body);

    expect(after).not.toBe(before);
  });

  it('팔레트가 그대로면 값도 그대로다', () => {
    document.body.style.backgroundColor = 'rgb(249, 248, 242)';
    document.body.style.color = 'rgb(29, 29, 31)';

    const first = paletteKey(document.body);
    const second = paletteKey(document.body);

    expect(second).toBe(first);
  });
});
