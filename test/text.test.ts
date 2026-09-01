import { describe, it, expect } from 'vitest';
import { measureText } from '../src/text';

describe('measureText', () => {
  it('한글은 폰트 크기와 거의 같은 폭을 가진다', () => {
    expect(measureText('주문', 13)).toBeCloseTo(26, 0);
  });

  it('라틴 소문자는 한글의 절반쯤이다', () => {
    const latin = measureText('order', 13);
    const hangul = measureText('주문', 13);
    expect(latin).toBeLessThan(hangul * 1.5);
    expect(latin).toBeGreaterThan(hangul * 0.8);
  });

  it('대문자가 소문자보다 넓다', () => {
    expect(measureText('ORDER', 13)).toBeGreaterThan(measureText('order', 13));
  });

  it('빈 문자열은 0 이다', () => {
    expect(measureText('', 13)).toBe(0);
  });

  it('폰트 크기에 선형으로 비례한다', () => {
    expect(measureText('주문', 26)).toBeCloseTo(measureText('주문', 13) * 2, 5);
  });
});
