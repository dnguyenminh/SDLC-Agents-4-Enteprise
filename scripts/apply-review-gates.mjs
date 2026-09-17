// One-off migration: add two review gates to all conversion mirrors.
//   Gate A (Phase 4): BA reviews Test Cases (STC) — QA done only after BA APPROVED.
//   Gate B (Phase 5): TA reviews implementation — code done only after TA APPROVED.
// Idempotent: skips a file if the gate marker is already present.
import fs from 'fs';

const root = process.cwd();
const log = [];

function edit(path, replacements, marker) {
  if (!fs.existsSync(path)) { log.push(`SKIP (missing): ${path}`); return; }
  let text = fs.readFileSync(path, 'utf8');
  if (marker && text.includes(marker)) { log.push(`SKIP (already applied): ${path}`); return; }
  let applied = 0;
  for (const [oldStr, newStr] of replacements) {
    if (text.includes(oldStr)) { text = text.replace(oldStr, newStr); applied++; }
  }
  if (applied === 0) { log.push(`WARN (no anchor matched): ${path}`); return; }
  fs.writeFileSync(path, text, 'utf8');
  log.push(`OK (${applied} edit(s)): ${path}`);
}

// ---------- Phase 4: BA reviews Test Cases ----------
const P4_MARKER = 'Step 4b.5: BA Reviews Test Cases';
const p4Outcomes = [
`**Outcomes:**
- **Approve** → proceed to finalize
- **Approve with conditions** → QA fixes → re-verify → proceed
- **Reject** → QA redo → re-review (max 2 iterations)

### Step 4c: Fix Issues (if any)`,
`**Outcomes:**
- **Approve** → proceed to Step 4b.5 (BA review)
- **Approve with conditions** → QA fixes → re-verify → proceed
- **Reject** → QA redo → re-review (max 2 iterations)

### Step 4b.5: BA Reviews Test Cases (MANDATORY — QA done only after BA approves)

**Sau khi SM review pass, BA PHẢI review STC để xác nhận test cases phản ánh đúng business requirements. QA chỉ hoàn thành việc khi BA agent đồng ý.**

1. Invoke BA to review Test Cases (STC + STP). BA reads BRD/FSD from KB and checks:
   1. Business coverage — Mọi User Story và Acceptance Criteria trong BRD đều có test case tương ứng?
   2. Business rules — Mọi BR-XX trong FSD đều được test?
   3. Đúng ý nghĩa nghiệp vụ — Expected results phản ánh đúng hành vi business mong đợi?
   4. Edge cases nghiệp vụ — Các luồng exception/alternative quan trọng đã được cover?
   5. Không thiếu, không thừa — Không bỏ sót requirement, không test ngoài scope.
   BA returns verdict: **APPROVED** or **CHANGES REQUESTED** (with the list of gaps).

2. Handle BA verdict:
   - **APPROVED** → proceed to finalize
   - **CHANGES REQUESTED** → invoke QA to fix STC/STP theo danh sách gap từ BA → re-invoke BA to re-review (max 2 iterations)

3. ⛔ **QA test planning KHÔNG được đánh dấu done cho tới khi BA verdict = APPROVED.** Nếu sau 2 iterations vẫn CHANGES REQUESTED → report user.

### Step 4c: Fix Issues (if any)`
];

// ---------- Phase 5: TA reviews implementation ----------
const P5_MARKER = 'Step 5c: TA Reviews Implementation';
const p5Verify = [
`### Step 5c: Verify & Push

4. Verify code created (check for new/modified files)

5. Commit and push:`,
`### Step 5c: TA Reviews Implementation (MANDATORY — code done only after TA approves)

**Sau khi DEV implement xong, TA (Technical Architect) PHẢI review code để xác nhận implementation bám sát thiết kế kỹ thuật (FSD/TDD). Code chỉ hoàn thành khi TA agent approve.**

4. Verify code created (check for new/modified files)

5. Invoke TA to review the implementation. TA reads FSD + TDD from KB and the code diff (git diff main..{TICKET}), then checks:
   1. Design conformance — Code có bám sát architecture/component design trong TDD?
   2. API contracts — Endpoints/signatures match TDD API design exactly?
   3. Integration — External/internal integrations đúng như TDD?
   4. Data model — Entities/fields khớp FSD + TDD data design?
   5. Pseudocode alignment — Complex logic implement đúng thuật toán đã thiết kế?
   6. Deviations — Có lệch thiết kế không? Nếu có, có justify được không?
   7. Patterns — Dùng đúng design pattern như TDD chỉ định?
   TA returns verdict: **APPROVED** or **CHANGES REQUESTED** (with the list of changes).

6. Handle TA verdict:
   - **APPROVED** → proceed to push
   - **CHANGES REQUESTED** → invoke DEV to fix theo danh sách từ TA → re-invoke TA to re-review (max 2 iterations)

7. ⛔ **Implementation KHÔNG được đánh dấu done cho tới khi TA verdict = APPROVED.** Nếu sau 2 iterations vẫn CHANGES REQUESTED → report user.

### Step 5d: Verify & Push

8. Commit and push:`
];

// ---------- role-boundaries edits ----------
const RB_MARKER = 'Test Case review verdict (Phase 4)';
const rbRow = [
`| **ba-agent** | BRD.md, FSD.md (draft), diagrams | Jira tickets, KB, code intelligence | ❌ Write TDD, code, tests, DPG |
| **ta-agent** | FSD.md (enrichment only) | BRD, FSD draft, code intelligence | ❌ Write BRD, TDD, code, tests |`,
`| **ba-agent** | BRD.md, FSD.md (draft), diagrams, Test Case review verdict (Phase 4) | Jira tickets, KB, code intelligence, STP/STC | ❌ Write TDD, code, tests, DPG |
| **ta-agent** | FSD.md (enrichment only), Implementation review verdict (Phase 5) | BRD, FSD draft, code intelligence, source code (git diff) | ❌ Write BRD, TDD, code, tests |`
];
const rbCollab = [
`| UG needs BA review | SM → invoke ba-agent with review prompt | SM reviews UG itself |
| Deploy guide needed | SM → invoke devops-agent | SM writes DPG |`,
`| UG needs BA review | SM → invoke ba-agent with review prompt | SM reviews UG itself |
| Test Cases need business review (Phase 4) | SM → invoke ba-agent to review STC — QA done only after BA APPROVED | SM approves STC itself / QA self-approves |
| Implementation needs design review (Phase 5) | SM → invoke ta-agent to review code — code done only after TA APPROVED | SM approves code itself / DEV self-approves |
| Deploy guide needed | SM → invoke devops-agent | SM writes DPG |`
];

// ---------- Agent prompt append (review-gate section) ----------
const AGENT_MARKER = '<!-- REVIEW-GATE -->';
const qaAppend = `\n\n---\n\n<!-- REVIEW-GATE -->\n## ⛔ Review Gate — BA Approval Required (Test Planning)\n\nAfter you produce the Test Cases (STC), the Business Analyst (ba-agent) reviews them for business coverage. **Your test planning is NOT complete until the BA returns a verdict of APPROVED.** If the BA returns CHANGES REQUESTED, address every listed gap (missing User Story / Acceptance Criteria / Business Rule coverage, wrong expected results, out-of-scope cases) and resubmit for re-review (max 2 iterations). Do not consider the STC/STP final without BA approval.\n`;
const devAppend = `\n\n---\n\n<!-- REVIEW-GATE -->\n## ⛔ Review Gate — TA Approval Required (Implementation)\n\nAfter you finish implementing, the Technical Architect (ta-agent) reviews your code for design conformance against the FSD and TDD. **Your implementation is NOT complete until the TA returns a verdict of APPROVED.** If the TA returns CHANGES REQUESTED (design deviations, API/contract mismatches, wrong data model, missing pattern, etc.), fix every listed item and resubmit for re-review (max 2 iterations). Do not consider the code done without TA approval.\n`;
const baAppend = `\n\n---\n\n<!-- REVIEW-GATE -->\n## ⛔ Extra Duty — Review Test Cases (Test Planning Phase)\n\nWhen the Scrum Master invokes you to review Test Cases, read the STC/STP and the BRD/FSD, then verify: every User Story, Acceptance Criteria, and Business Rule is covered by a test case; expected results reflect the intended business behavior; and there is no missing or out-of-scope coverage. Return a verdict of **APPROVED** or **CHANGES REQUESTED** (with a specific list of gaps). QA cannot close out test planning without your approval.\n`;
const taAppend = `\n\n---\n\n<!-- REVIEW-GATE -->\n## ⛔ Extra Duty — Review Implementation (Implementation Phase)\n\nWhen the Scrum Master invokes you to review an implementation, read the FSD + TDD and the code diff, then verify the code conforms to the technical design: API contracts, integration points, data model, algorithm/pseudocode alignment, correct design patterns, and no unjustified deviations. Return a verdict of **APPROVED** or **CHANGES REQUESTED** (with a specific list of changes). DEV cannot close out implementation without your approval.\n`;

function appendSection(path, section, marker) {
  if (!fs.existsSync(path)) { log.push(`SKIP (missing): ${path}`); return; }
  let text = fs.readFileSync(path, 'utf8');
  if (text.includes(marker)) { log.push(`SKIP (already applied): ${path}`); return; }
  text = text.replace(/\s*$/, '') + section;
  fs.writeFileSync(path, text, 'utf8');
  log.push(`OK (append): ${path}`);
}

// ===== File lists =====
const phase4Files = [
  'conversions/codex-openai/instructions/phase-4-test-planning.md',
  'conversions/github-copilot/.github/instructions/phase-4-test-planning.instructions.md',
  'conversions/antigravity/skills/phase-4-test-planning/SKILL.md',
  'conversions/opencode/.opencode/skills/phase-4-test-planning/SKILL.md',
];
const phase5Files = [
  'conversions/codex-openai/instructions/phase-5-implementation.md',
  'conversions/github-copilot/.github/instructions/phase-5-implementation.instructions.md',
  'conversions/antigravity/skills/phase-5-implementation/SKILL.md',
  'conversions/opencode/.opencode/skills/phase-5-implementation/SKILL.md',
];
const roleBoundaryFiles = [
  'conversions/codex-openai/instructions/role-boundaries.md',
  'conversions/github-copilot/.github/instructions/role-boundaries.instructions.md',
  'conversions/opencode/.opencode/rules/sdlc/role-boundaries.md',
];
const agentFiles = {
  qa: [
    'conversions/codex-openai/agents/qa-agent.md',
    'conversions/claude-code/.claude/agents/qa-agent.md',
    'conversions/github-copilot/.github/agents/qa-agent.md',
    'conversions/opencode/.opencode/agents/qa-agent.md',
  ],
  dev: [
    'conversions/codex-openai/agents/dev-agent.md',
    'conversions/claude-code/.claude/agents/dev-agent.md',
    'conversions/github-copilot/.github/agents/dev-agent.md',
    'conversions/opencode/.opencode/agents/dev-agent.md',
  ],
  ba: [
    'conversions/codex-openai/agents/ba-agent.md',
    'conversions/claude-code/.claude/agents/ba-agent.md',
    'conversions/github-copilot/.github/agents/ba-agent.md',
    'conversions/opencode/.opencode/agents/ba-agent.md',
  ],
  ta: [
    'conversions/codex-openai/agents/ta-agent.md',
    'conversions/claude-code/.claude/agents/ta-agent.md',
    'conversions/github-copilot/.github/agents/ta-agent.md',
    'conversions/opencode/.opencode/agents/ta-agent.md',
  ],
};

// ===== Apply =====
for (const f of phase4Files) edit(f, [p4Outcomes], P4_MARKER);
for (const f of phase5Files) edit(f, [p5Verify], P5_MARKER);
for (const f of roleBoundaryFiles) edit(f, [rbRow, rbCollab], RB_MARKER);
for (const f of agentFiles.qa) appendSection(f, qaAppend, AGENT_MARKER);
for (const f of agentFiles.dev) appendSection(f, devAppend, AGENT_MARKER);
for (const f of agentFiles.ba) appendSection(f, baAppend, AGENT_MARKER);
for (const f of agentFiles.ta) appendSection(f, taAppend, AGENT_MARKER);

console.log(log.join('\n'));
