// Temp QA script: structural YAML validation of the CI workflow (actionlint unavailable).
const fs = require('fs');
const path = require('path');
const yaml = require(path.join(process.cwd(), 'node_modules', 'js-yaml'));

const wf = '.github/workflows/build-push-backend.yml';
const src = fs.readFileSync(wf, 'utf8');
let doc;
try {
  doc = yaml.load(src);
  console.log('YAML_PARSE=OK');
} catch (e) {
  console.log('YAML_PARSE=FAIL:', e.message);
  process.exit(2);
}

const on = doc.on !== undefined ? doc.on : doc[true]; // 'on' may map to boolean true
console.log('triggers=', JSON.stringify(Object.keys(on)));
console.log('push.branches=', JSON.stringify(on.push.branches));
console.log('push.tags=', JSON.stringify(on.push.tags));
console.log('pull_request.branches=', JSON.stringify(on.pull_request.branches));

const job = doc.jobs['build-and-push'];
console.log('runs-on=', job['runs-on']);
const steps = job.steps;
const meta = steps.find(s => s.id === 'meta');
console.log('meta.tags=\n' + meta.with.tags);
const build = steps.find(s => s.id === 'build');
console.log('build.target=', build.with.target);
console.log('build.push_expr=', build.with.push);
const login = steps.find(s => s.name && s.name.includes('Log in'));
console.log('login.if=', login.if);
console.log('login.password=', login.with.password);
console.log('login.username=', login.with.username);
const trivy = steps.find(s => s.name && s.name.includes('Trivy'));
console.log('trivy.exit-code=', trivy.with['exit-code'], 'severity=', trivy.with.severity, 'if=', trivy.if);

// third-party actions pinned by sha (40-hex)
const pinned = steps.filter(s => s.uses).map(s => ({ uses: s.uses, pinned: /@[0-9a-f]{40}/.test(s.uses) }));
console.log('action_pins=', JSON.stringify(pinned, null, 2));

// basic lint-style structural assertions
const errs = [];
if (!on.push.branches.includes('main')) errs.push('push.branches missing main');
if (!on.push.tags.some(t => t === 'v*.*.*')) errs.push('push.tags missing v*.*.*');
if (!on.pull_request.branches.includes('main')) errs.push('pull_request.branches missing main');
if (build.with.target !== 'production') errs.push('build target != production');
if (!String(build.with.push).includes("github.event_name != 'pull_request'")) errs.push('push not gated to non-PR');
if (!String(login.if).includes("github.event_name != 'pull_request'")) errs.push('login not gated to non-PR');
if (!String(login.with.password).includes('secrets.')) errs.push('login password not from secrets');
if (pinned.some(p => !p.pinned)) errs.push('some actions not SHA-pinned');
console.log('STRUCTURAL_ERRORS=', errs.length ? JSON.stringify(errs) : 'NONE');
