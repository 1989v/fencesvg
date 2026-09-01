import { readFileSync } from 'node:fs';

const deps = JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {};
if (Object.keys(deps).length > 0) {
  console.error('  ✗ 런타임 의존성이 생겼다:', deps);
  process.exit(1);
}
console.log('  ✓ 런타임 의존성 0');
