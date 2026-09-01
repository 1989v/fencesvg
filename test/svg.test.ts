import { describe, it, expect } from 'vitest';
import { el, text, svgRoot, escapeXml, pathData, snap4, snapPoint, snapBox } from '../src/svg';

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
    // 고유 크기를 함께 낸다 — viewBox 만 있으면 브라우저가 컨테이너 폭에 맞춰 확대한다
    expect(out).toMatch(/<svg width="100" height="40" viewBox="0 0 100 40"/);
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

  it('children 의 금지된 태그를 잡는다 (Finding 1)', () => {
    expect(() => svgRoot({ width: 100, height: 40, label: 'test', body: ['<style>.x{}</style>'] })).toThrow(
      /금지된 태그/
    );
  });

  it('body 내 임베디드 개행과 빈 줄을 필터한다 (Finding 2)', () => {
    const out = svgRoot({
      width: 100,
      height: 40,
      label: 'test',
      body: ['<g>\n\n<rect/></g>'],
    });
    expect(out.split('\n').every((l) => l.trim().length > 0)).toBe(true);
  });

  it('정수가 아닌 pad 를 viewBox 원점에서 반올림한다 (Finding 3)', () => {
    const out = svgRoot({ width: 100, height: 40, label: 'test', body: [], pad: 2.345 });
    expect(out).toContain('viewBox="-2.35 -2.35');
  });
});

describe('snap4', () => {
  it('4의 배수로 반올림한다', () => {
    expect(snap4(0)).toBe(0);
    expect(snap4(2)).toBe(4); // 반올림 — 2는 0과 4 정중앙, JS Math.round 관례대로 위로
    expect(snap4(5)).toBe(4);
    expect(snap4(6)).toBe(8);
    expect(snap4(-3)).toBe(-4);
  });
});

describe('snapPoint / snapBox', () => {
  it('점의 x·y 를 각각 스냅한다', () => {
    expect(snapPoint({ x: 5, y: 9 })).toEqual({ x: 4, y: 8 });
  });

  it('위치·크기를 모두 스냅하고 나머지 필드는 보존한다', () => {
    expect(snapBox({ id: 'a', x: 5, y: 9, w: 14, h: 41 })).toEqual({ id: 'a', x: 4, y: 8, w: 16, h: 40 });
  });
});

describe('pathData', () => {
  it('점이 없으면 빈 문자열이다', () => {
    expect(pathData([])).toBe('');
  });

  it('2점이면 직선(M·L)이고 곡선 커맨드가 없다', () => {
    const d = pathData([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(d).toBe('M 0 0 L 100 0');
    expect(d).not.toContain('Q');
  });

  it('꺾이는 지점마다 Q 커맨드로 둥근 모서리를 넣는다', () => {
    const d = pathData([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 40, y: 40 }], 6);
    // 코너(0,40) 진입점은 코너에서 반경 6만큼 앞선 (0,34), 진출점은 (6,40)
    expect(d).toBe('M 0 0 L 0 34 Q 0 40 6 40 L 40 40');
  });

  it('인접 구간이 반경보다 짧으면 그 구간 길이의 절반으로 줄인다', () => {
    // 두 구간 모두 길이 4 — 반경 6 대신 각 2(길이의 절반)를 써야 한다
    const d = pathData([{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 4, y: 4 }], 6);
    expect(d).toBe('M 0 0 L 0 2 Q 0 4 2 4 L 4 4');
  });

  it('back-edge 5점 경로도 렌더되고 마지막 구간은 직선(L)으로 끝난다 — marker-end 각도가 여기서 나온다', () => {
    const d = pathData([
      { x: 200, y: 20 }, { x: 200, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 20 }, { x: 20, y: 20 },
    ], 6);
    expect((d.match(/Q /g) ?? []).length).toBe(3); // 내부 꺾임 3개
    expect(d.endsWith('L 20 20')).toBe(true); // 끝은 항상 직선
  });
});
