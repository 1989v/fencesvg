import { describe, it, expect } from 'vitest';
import { version } from '../src/index';

describe('패키지', () => {
  it('버전을 노출한다', () => {
    expect(version).toBe('0.1.0');
  });
});
