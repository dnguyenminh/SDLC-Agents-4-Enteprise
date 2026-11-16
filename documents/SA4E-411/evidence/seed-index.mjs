// seed-index.mjs — push selected SA4E-411 source files into the ISOLATED backend
// so the code-intelligence tools can resolve symbols that exist ONLY on this branch.
//
// Usage: node seed-index.mjs <backendUrl> <projectId> <repoRoot> <file...>

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [base, projectId, repoRoot, ...files] = process.argv.slice(2);

const entries = files.map((rel) => ({
  path: rel.replace(/\\/g, '/'),
  content: readFileSync(join(repoRoot, rel), 'utf8'),
}));

const res = await fetch(`${base}/api/index/source`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Project-Id': projectId,
    Authorization: `Bearer ${process.env.SA411_TOKEN ?? ''}`,
  },
  body: JSON.stringify({ files: entries }),
});

const text = await res.text();
console.log(`POST ${base}/api/index/source -> HTTP ${res.status}`);
console.log(text.slice(0, 2000));
