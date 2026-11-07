const fs = require('fs');
const path = require('path');
const root = process.cwd();
const csPath = path.join(root, 'extension/resources/.sdlc-checksums.json');
const data = JSON.parse(fs.readFileSync(csPath, 'utf8'));
const files = data.files;

function sha256(buf) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

let total = 0, ok = 0, mismatch = 0, missing = 0;
const failures = [];
for (const rel of Object.keys(files)) {
  total++;
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) { missing++; continue; }
  const actual = sha256(fs.readFileSync(full));
  const expected = files[rel].hash || '';
  if (!expected) continue;
  if (actual === expected) ok++;
  else { mismatch++; failures.push(`${rel}\n    expected ${expected.slice(0,12)}\n    actual   ${actual.slice(0,12)}`); }
}
console.log(`Checksum files: total ${total}, match ${ok}, mismatch ${mismatch}, missing ${missing}`);
for (const f of failures.slice(0, 30)) console.log('MISMATCH:\n' + f);
