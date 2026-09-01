// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { detectTheme, mix, withAlpha } from '../src/auto';
import { renderDiagram } from '../src/render';

describe('color(srgb …) 파싱', () => {
  it('0~1 스케일을 0~255 로 바꾸고 알파를 함께 읽는다', () => {
    expect(withAlpha('color(srgb 0 0.5 1 / 0.4)', 0.4)).toBe('rgba(0, 128, 255, 0.4)');
  });

  it('알파를 1 로 주면 rgb() 로 나온다(color-mix() 의 computed 값을 rgb() 와 섞을 수 있다)', () => {
    expect(mix('color(srgb 1 1 1)', 'rgb(0, 0, 0)', 0.5)).toBe('rgb(128, 128, 128)');
  });

  it('파싱에 실패하면 던지지 않고 원래 문자열을 돌려준다', () => {
    expect(mix('not-a-color', 'rgb(0, 0, 0)', 0.5)).toBe('not-a-color');
    expect(withAlpha('not-a-color', 0.5)).toBe('not-a-color');
  });
});

describe('알려진 팔레트를 가진 페이지에서 감지', () => {
  // body 자체가 바탕(ground)·잉크(ink)·글자 크기를 낸다. 링크가 강조(action),
  // hr 의 테두리가 구조선(structure), 카드가 반경, figcaption 이 뮤트 색을 낸다.
  document.body.style.backgroundColor = '#ffffff';
  document.body.style.color = '#222222';
  document.body.style.fontSize = '15px';
  document.body.innerHTML = `
    <a href="/pricing">가격</a>
    <hr />
    <div class="card">카드</div>
    <figure><figcaption>설명</figcaption></figure>
  `;
  const link = document.body.querySelector('a') as HTMLElement;
  link.style.color = '#2e7d32';
  const hr = document.body.querySelector('hr')!;
  hr.setAttribute('style', 'border-top-width: 1px; border-top-color: #dddddd; border-top-style: solid;');
  const card = document.body.querySelector('.card') as HTMLElement;
  card.style.borderRadius = '8px';
  const figcaption = document.body.querySelector('figcaption') as HTMLElement;
  figcaption.style.color = '#666666';

  const theme = detectTheme(document.body);

  it('accent 는 링크의 색이다', () => {
    expect(theme.accent).toBe('var(--fs-accent, rgb(46, 125, 50))');
  });

  it('line/nodeBorder 는 hr 테두리 색(구조)이다', () => {
    expect(theme.line).toBe('var(--fs-line, rgb(221, 221, 221))');
    expect(theme.nodeBorder).toBe('var(--fs-node-border, rgb(221, 221, 221))');
  });

  it('radius 는 카드의 border-radius 다', () => {
    expect(theme.radius).toBe('var(--fs-radius, 8)');
  });

  it('ink/labelChip(바탕)/muted 가 페이지에서 읽힌다', () => {
    expect(theme.ink).toBe('var(--fs-ink, rgb(34, 34, 34))');
    expect(theme.labelChip).toBe('var(--fs-label-chip, rgb(255, 255, 255))');
    expect(theme.muted).toBe('var(--fs-muted, rgb(102, 102, 102))');
  });

  it('fontSize 는 10~16 사이로 페이지 값을 그대로 쓰고, labelSize 는 그보다 3 작다', () => {
    expect(theme.fontSize).toBe(15);
    expect(theme.labelSize).toBe(12);
  });

  it('강조 노드를 그리면 SVG 에 링크의 색이 accent 로 나온다', () => {
    const r = renderDiagram('%% caption: c\nflowchart LR\n A[a] --> B[b]\n class B emphasis');
    expect(r.svg).toContain('rgb(46, 125, 50)');
  });
});
