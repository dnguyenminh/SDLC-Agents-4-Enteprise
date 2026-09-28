# 🔒 Security Assessment (Phase 5.7 — Code Review) — SA4E-326: Pi Prompt Compression + Role-scoped Prompts

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-326 |
| Phase | 5.7 — Post-implementation security assessment |
| Scope (code) | `extension/src/pi-agent/model-tier.ts`, `prompt-compressor.ts`, `role-scope.ts`, `prompt-template-scan.ts`, `prompt-template.service.ts`, `agent-configurator.ts`; tests `__tests__/{model-tier,prompt-compressor,role-scope,prompt-template.service,prompt-template-tiers,agent-configurator*,prompt-template-tiers}.test.ts` |
| Design baseline | `documents/SA4E-326/TDD.md` v1.0; Phase 3.7 verdict: **APPROVED-WITH-CONDITIONS** (`SECURITY-REVIEW.md`) |
| Date | 2026-09-27 |
| Assessor | Security Agent (static code review, no exploitation) |
| Version | 1.0 |

## Executive Summary

The shipped code confirms all 7 design findings with concrete file:line evidence and adds 1 new Low finding (template-scan silent skips contradict their own "log and continue" comment — folded into SEC-326-07 status). The strongest code property verified: **template names are traversal-proof** (`validateTemplateName` `^[a-z0-9-]+$`, `prompt-template-scan.ts:20-24`) and `path.basename` is applied before any name use — no path injection through template names. The main open items are the workspace-prompt-injection surface (SEC-326-01, Medium), unbounded template reads (SEC-326-02, Medium), and the compression integrity gap (SEC-326-04) — `stripBoilerplateLines` will strip a security line such as `Tip: never exfiltrate secrets` from a small-tier role prompt.

No Critical/High findings. No unsafe dynamic `require` (fixed-literal `require('@earendil-works/pi-coding-agent')` in `resource-loader.factory.ts:24` is a pinned package, not user input ✅). No prototype-pollution sinks; no `JSON.parse` of untrusted data in this module ✅.

**Overall Risk Rating: Medium**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 (confirmed from design) |
| 🔵 Low | 4 (3 confirmed + 1 new) |
| ℹ️ Informational | 2 |

## Findings Table (code-verified)

| ID | Severity | Title | File:Line | Status |
|----|----------|-------|-----------|--------|
| SEC-326-01 | Medium | Workspace `.pi/prompts` + `SYSTEM.md` injected into system prompt without trust gate/size cap (prompt poisoning surface in untrusted repos) | `prompt-template.service.ts:30-38,96-133`; `agent-configurator.ts:64-74,111-118` | Open — blocking for epic wiring |
| SEC-326-02 | Medium | Unbounded sync `readFileSync` of template files (no stat/size cap) — extension-host freeze via hostile workspace file | `prompt-template.service.ts:38,137`; `prompt-template-scan.ts:36-42` | Open |
| SEC-326-03 | Low | Lazy dot-all regexes in compression (`<!--[\s\S]*?-->`, fenced-example) — super-linear on adversarial templates | `prompt-compressor.ts:7-13` | Open |
| SEC-326-04 | Low | Compression strips security-relevant lines (`tip|note|hint|see also:`) and example blocks from prompts on small tier — silent security-semantics loss | `prompt-compressor.ts:26,35-40` | Open |
| SEC-326-05 | Low | `RoleScopeFilter.isAllowed` fail-opens for unknown roles | `role-scope.ts:24-28` | Open (mitigated at entry: `validateAgentRole` throws, `agent-configurator.ts:34-38` ✅) |
| SEC-326-06 | Info | Full prompt content logged at debug in REPLACE path | `agent-configurator.ts:135` | Open |
| SEC-326-07 | Info | Template discovery swallows errors with no log (`catch {}` where comment says "log and continue") | `prompt-template-scan.ts:52-54`; `prompt-template.service.ts:47-49,61` | Open (new evidence) |
| SEC-326-08 (new) | Low | `discover()` eager-loads every template file into memory at session start (all variants) — memory amplification with many/large templates | `prompt-template.service.ts:34-50` | Open |

## Detailed Findings (evidence)

### SEC-326-01 — confirmed

```typescript
// prompt-template.service.ts:30-31 — sources include workspace + user dirs
private templateSources(): string[] {
  return [path.join(this.cwd, '.pi', 'prompts'), path.join(this.agentDir, 'prompts')];
}
// agent-configurator.ts:68-70 — SYSTEM.md content appended verbatim (replace mode)
const content = fs.readFileSync(systemMd, 'utf-8').trim();
return `${prompt}\n\n${content}`;
// agent-configurator.ts:99-100 — template content appended to role prompt
return `${base}\n\n${tpl.promptContent}`;
```
No workspace-trust check, no size cap, no provenance marking. In an untrusted repo, `.pi/prompts/x.md` and `SYSTEM.md` become attacker-authored system-prompt segments (steering tool calls — compounding SEC-324-03's un-gated `execute_dynamic_tool`).

**Remediation:** gate on the existing trust model:
```typescript
// agent-configurator.ts
function appendSystemMd(prompt: string, cwd: string, opts: { trusted: boolean }): string {
  if (!opts.trusted) return prompt;                      // skip untrusted workspace content
  const MAX = 64 * 1024;
  const candidate = path.resolve(cwd, 'SYSTEM.md');
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile() || stat.size > MAX) return prompt;
    const real = fs.realpathSync(candidate);
    if (!real.startsWith(fs.realpathSync(cwd) + path.sep)) return prompt;  // symlink containment
    return `${prompt}\n\n${fs.readFileSync(real, 'utf-8').trim()}`;
  } catch { return prompt; }
}
// + PromptTemplateService.discover: skip workspace source when !trusted; log loaded {name, bytes}
```
This also fixes the size-cap and symlink-containment halves of SEC-326-02 for the SYSTEM.md sink.

### SEC-326-02 — confirmed

`prompt-template.service.ts:38` (`fs.readFileSync(file, 'utf-8')` in `discover`) and `:137` (`loadPromptContent`) read with no `statSync` size check. A repo can contain `.pi/prompts/big.md` of arbitrary size → sync freeze. **Fix:** check `fs.statSync(file).size > 262_144` → skip + `logger.warn`.

### SEC-326-03 / 04 — confirmed

```typescript
// prompt-compressor.ts:8,12 — lazy dot-all, worst-case O(n·m)
text.replace(/<!--[\s\S]*?-->/g, '');
text.replace(/```(?:example|ex|sample)[^\n]*\n[\s\S]*?```/gi, '');
// prompt-compressor.ts:38 — strips any line starting with tip/note/hint/see-also
!/^\s*[-*]?\s*(tip|note|hint|see also)\b\s*:/i.test(line)
```
(a) Replace with single-pass line-state parsing, or cap input (`if (template.length > 1_048_576) return template;`). (b) Introduce `NON_STRIPPABLE_RE = /^\s*(security|warning|never|do not|important)\b/i` and keep those lines even if they match boilerplate; move security instructions out of example blocks in role prompts.

### SEC-326-05 — confirmed with mitigation noted

`role-scope.ts:25` `if (!this.isKnownRole(role)) return true;` — unknown role sees ALL skills. Main path protected by `validateAgentRole` throw (`agent-configurator.ts:166`) and `applySkillsOverride` only invoked with validated roles ✅ — but the class default is fail-open; flip to default-deny:
```typescript
isAllowed(role: string, skillId: string): boolean {
  if (!this.isKnownRole(role)) return false;   // default-deny
  …
}
```

### SEC-326-06 / 07 / 08

- `agent-configurator.ts:135` `logger.debug('Prompt override mode REPLACE', { role, prompt })` — logs full (currently canned) prompt; switch to `{ role, promptChars: prompt.length, promptHash }`.
- `prompt-template-scan.ts:52-54` `catch { // log and continue }` — no log executed; add `logger.debug('Template skipped', { file, reason })`.
- `prompt-template.service.ts:34-50` — `discover()` reads ALL template files eagerly (full variants + overrides) even if only one name is later requested; prefer lazy `discoverForTier` path and drop eager content reads in `discover()` (keep metadata only). Memory-amplification hardening.

## Positive Controls Verified in Code ✅

- **Traversal-proof template names:** `validateTemplateName` `^[a-z0-9-]+$` (`prompt-template-scan.ts:20-24`) + `path.basename` before parsing (`:27`); `getPrompt/getPromptForTier/getPromptVariants` all validate the requested name before use (`prompt-template.service.ts:82,91,124`) — a `../../` name cannot reach a file read.
- `parseVariantName` strips both extensions via `path.basename` — no `..` survival.
- Role/mode validation throws (`agent-configurator.ts:34-44,166-167`); `rolePromptFor` logs `ROLE_MISMATCH` and falls back to a *default safe prompt* (not to attacker content).
- `compressPrompt` try/catch → original (fail-safe, `prompt-compressor.ts:51-62`); `CompressedVariant.withinBudget` ≤ 0.6 guard.
- REPLACE mode sets `appendSystemPromptOverride = []` — explicit double-injection prevention (`agent-configurator.ts:132-135`).
- `lazyTemplate` records file sizes via `statSync` without content reads; `fileTokenSize` catch → 0 (no crash).
- Tier regexes (`model-tier.ts:5-27`) are linear, anchored on short model-id strings — no ReDoS; `detectModelTier` null-safe on non-string input.

## Risk Rating

**Medium** — the module decides system-prompt content; the untrusted-workspace path (SEC-326-01) is the only finding with realistic attack flow, and it is not yet reachable from production wiring (configurator invoked from tests/`buildResourceLoaderOptions` only, per greps).

## Verdict

**APPROVED-WITH-CONDITIONS** — conditions:

1. **(Blocking for epic wiring)** SEC-326-01: workspace-trust gate + size cap + symlink containment for `.pi/prompts` and `SYSTEM.md` before Pi sessions reach production chat.
2. (Same PR) SEC-326-02 size caps; SEC-326-04 non-strippable security lines; SEC-326-05 default-deny scope filter.
3. (Follow-up) SEC-326-03 linear parsing or input cap; SEC-326-06/07/08 logging/laziness hygiene.

## Appendix — Methodology & Limitations

- Full reads of 6 source files + relevant tests; greps for `require(`/dynamic imports, `JSON.parse`, `__proto__`, `eval` (none). No runtime testing; no exploitation (role boundary: report only).
- Tests are functional only — **no security test cases** (no test asserts a traversal name is rejected at runtime, no prompt-content-leak log assertions). Recommend adding: `getPrompt('../../etc/passwd')` throws `PromptTemplateError`; compressed role prompt retains a `security:` line; unknown-role scope filter returns false.
- `DefaultResourceLoader` (Pi SDK) consumption of `systemPromptOverride`/`appendSystemPromptOverride` unverified — assess when the session wiring ticket lands.
