import { describe, it, expect } from 'vitest';
import { el, text, svgRoot, escapeXml } from '../src/svg';

describe('el', () => {
  it('요소를 한 줄로 낸다', () => {
    const out = el('rect', { x: 1, y: 2, width: 10, height: 4 });
    expect(out).toBe('<rect x="1" y="2" width="10" height="4"/>');
    expect(out).not.toContain('\n');
  });

  it('undefined 속성은 빼고 낸다', () => {
    expect(el('rect', { x: 1, fill: undefined })).toBe('<rect x="1"/>');
  });

  it('금지된 태그는 낼 수 없다', () => {
    for (const tag of ['style', 'script', 'use', 'foreignObject']) {
      expect(() => el(tag, {})).toThrow(/금지된 태그/);
    }
  });

  it('자식이 있으면 감싼다', () => {
    expect(el('g', { id: 'a' }, ['<rect/>'])).toBe('<g id="a"><rect/></g>');
  });
});

describe('text', () => {
  it('내용을 이스케이프한다', () => {
    expect(text('a < b & c', { x: 0 })).toBe('<text x="0">a &lt; b &amp; c</text>');
  });
});

describe('escapeXml', () => {
  it('다섯 문자를 바꾼다', () => {
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&apos;');
  });
});

describe('svgRoot', () => {
  const out = svgRoot({ width: 100, height: 40, label: '주문이 결제로 간다', body: ['<rect/>', '<line/>'] });

  it('viewBox 를 쓰고 width·height 속성은 안 쓴다', () => {
    expect(out).toContain('viewBox="0 0 100 40"');
    expect(out).not.toMatch(/<svg[^>]*\swidth=/);
  });

  it('role 과 aria-label 을 단다', () => {
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="주문이 결제로 간다"');
  });

  it('빈 줄이 없다', () => {
    expect(out.split('\n').every((l) => l.trim().length > 0)).toBe(true);
  });

  it('한 줄에 요소 하나씩이다', () => {
    const lines = out.split('\n');
    expect(lines).toContain('<rect/>');
    expect(lines).toContain('<line/>');
  });
});
