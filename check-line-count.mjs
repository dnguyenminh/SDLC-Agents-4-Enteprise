import { globSync } from 'glob';
import { readFileSync } from 'fs';

const files = globSync('extension/src/**/*.ts', { ignore: ['**/__tests__/**'] });
let hasViolations = false;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;
  if (lines > 200) {
    console.log(`${file}: ${lines} lines`);
    hasViolations = true;
  }
}

if (!hasViolations) {
  console.log('All files <= 200 lines ✓');
}

process.exit(hasViolations ? 1 : 0);