import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';

const BUDGET_KB = 20;
const file = 'dist/index.js';

const raw = readFileSync(file);
const gz = gzipSync(raw, { level: 9 }).length;
const kb = gz / 1024;

console.log(`  ${file}  raw ${(statSync(file).size / 1024).toFixed(1)} KB · gzip ${kb.toFixed(1)} KB (예산 ${BUDGET_KB} KB)`);

if (kb > BUDGET_KB) {
  console.error(`  ✗ 번들 예산 초과: ${kb.toFixed(1)} KB > ${BUDGET_KB} KB`);
  process.exit(1);
}
console.log('  ✓ 예산 안');
