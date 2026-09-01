import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { version } from '../src/index';

describe('패키지', () => {
  // 리터럴을 적어 두면 범프할 때마다 두 곳을 고쳐야 하고, 한쪽만 고치면
  // 테스트가 빨간불이 되거나(운이 좋으면) 옛 버전을 내보내며 통과한다.
  // package.json 을 원본으로 삼으면 어긋날 자리가 없다.
  it('package.json 과 같은 버전을 노출한다', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(version).toBe(pkg.version);
  });
});
