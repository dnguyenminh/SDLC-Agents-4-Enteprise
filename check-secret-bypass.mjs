import { globSync } from 'glob';
import { readFileSync } from 'fs';

const files = globSync('extension/src/**/*.ts', { ignore: ['**/__tests__/**'] });
const allowedFiles = [
  'extension/src/config/llm-secret-keys.ts'
];

let violations = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for direct secrets.get/store on LLM-related keys
    // Allow if using llmSecretKey helper
    if (/secrets\.(get|store)\(/.test(line) && !/llmSecretKey\(/.test(line)) {
      // Check if it's an LLM key (contains ApiKey, llm, or provider)
      if (/ApiKey|llm\.(provider|model)/.test(line)) {
        const isAllowed = allowedFiles.some(af => file.replace(/\\/g, '/').includes(af.replace(/\\/g, '/')));
        if (!isAllowed) {
          violations.push(`${file}:${i+1}: ${line.trim()}`);
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.log('SECRET BYPASS VIOLATIONS (outside llm-secret-keys.ts, not using llmSecretKey):');
  violations.forEach(v => console.log(v));
} else {
  console.log('No secret bypass violations ✓');
}

process.exit(violations.length > 0 ? 1 : 0);