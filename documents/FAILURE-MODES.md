# Failure Mode Catalog — SA4E Agent Pipeline

> **Living document** — Update khi gặp failure pattern mới.
> **Last updated:** 2026-07-08

---

## 1. Infinite Feedback Loop

| Field | Value |
|-------|-------|
| **ID** | FM-001 |
| **Severity** | High |
| **Symptom** | BA↔SA feedback loop chạy 5 iterations mà discrepancies không giảm. FSD version tăng liên tục nhưng TDD vẫn report cùng issues. |
| **Root Cause** | BA fix FSD theo hướng khác với SA expect. Hoặc discrepancy report không đủ cụ thể để BA biết fix gì. |
| **Mitigation** | Circuit breaker (max 5 iterations → hard stop). SM report remaining discrepancies cho user review thủ công. Consider: SA provide exact text suggestion, not just "missing X". |
| **Detection** | `STATUS.json.feedback_loop.iterations >= 4` AND same discrepancy count. |

---

## 2. Verifier Theater

| Field | Value |
|-------|-------|
| **ID** | FM-002 |
| **Severity** | High |
| **Symptom** | SM report "✅ 6/6 checks passed" nhưng document thực tế thiếu content quan trọng. Quality gate pass nhưng output vẫn subpar. |
| **Root Cause** | SM chỉ check header existence (grep "## Architecture") mà không verify nội dung bên dưới có substance. Placeholder text passes check. |
| **Mitigation** | Enhanced verification: check section length > 100 chars. Check for placeholder patterns ("TODO", "TBD", "Lorem ipsum"). Cross-reference section count vs BRD requirement count. |
| **Detection** | Manual review finds gaps that SM verification missed. Document sections < 3 lines of actual content. |

---

## 3. Token Burn

| Field | Value |
|-------|-------|
| **ID** | FM-003 |
| **Severity** | Medium |
| **Symptom** | Sub-agent retry liên tục trên bad input. Token usage spikes. Same error repeats. |
| **Root Cause** | Agent receives invalid prerequisites (corrupted FSD, wrong ticket key, KB returns stale data). Agent retries same operation with same bad input. |
| **Mitigation** | Token budget tracking (Item 2). Circuit breaker after 3 failures. SM validate input BEFORE invoking agent — check file exists, has content, correct ticket key in header. |
| **Detection** | RUN-LOG shows 3+ consecutive ❌ for same agent+phase. Token estimate > 100k single invoke. |

---

## 4. State Rot

| Field | Value |
|-------|-------|
| **ID** | FM-004 |
| **Severity** | Medium |
| **Symptom** | STATUS.json says "done" but file no longer exists. Or STATUS says "in_progress" but phase was completed hours ago. Jira status and STATUS.json disagree. |
| **Root Cause** | File deleted/moved after STATUS was updated. SM crashed mid-phase. Manual file editing without STATUS update. |
| **Mitigation** | Step 0 ALWAYS re-scan files to verify STATUS claims. If STATUS says "done" but file missing → mark "needs_revision". Sync with Jira status on every resume. |
| **Detection** | File scan contradicts STATUS.json. `lastUpdated` > 24h ago with in_progress phases. |

---

## 5. Agent Hallucination

| Field | Value |
|-------|-------|
| **ID** | FM-005 |
| **Severity** | Critical |
| **Symptom** | Agent reports "✅ Document created" or "File saved at documents/X/Y.md" but file doesn't actually exist on disk. SM marks phase as done based on agent's report. |
| **Root Cause** | Agent context window overflow — loses track of actual file operations. Or agent hits tool error silently and reports success anyway. |
| **Mitigation** | SM MUST always verify file existence with `readFile` or `listDirectory` AFTER agent reports completion. NEVER trust agent's "done" report without file verification. Post-phase verification checklist is non-optional. |
| **Detection** | `readFile` returns "file not found" for path agent claimed to create. Document < 100 chars (placeholder). |

---

## 6. Diagram Export Failure

| Field | Value |
|-------|-------|
| **ID** | FM-006 |
| **Severity** | Medium |
| **Symptom** | draw.io CLI exits 0 but PNG is empty, corrupted, or missing. Diagram renders correctly in draw.io desktop but CLI export produces blank image. |
| **Root Cause** | draw.io XML has unsupported elements for CLI renderer. Self-closing edge cells without `<mxGeometry>`. `<mxfile>` wrapper instead of `<mxGraphModel>` root. Electron renderer crash on complex diagrams. |
| **Mitigation** | Validate XML before export (check for self-closing edges, mxfile wrapper). Verify PNG file size > 1KB after export. If export fails → retry with simplified diagram. Vision self-check on exported PNG. |
| **Detection** | PNG file size < 1KB. PNG missing after export command returns 0. Visual check shows blank/corrupted image. |

---

## 7. Jira API 410 Gone

| Field | Value |
|-------|-------|
| **ID** | FM-007 |
| **Severity** | Low |
| **Symptom** | `jira_search` returns HTTP 410. Project-level queries fail. Individual issue GET works fine. |
| **Root Cause** | Team-managed Jira projects don't support JQL search via REST API v3. Only company-managed projects support full JQL. |
| **Mitigation** | Use `jira_get_board_issues(board_id)` as workaround. Cache board_id in workflow docs. Individual ticket operations still work normally. |
| **Detection** | 410 error specifically on `jira_search` or `jira_get_project_issues`. |

---

## Template for New Entries

```markdown
## {N}. {Short Name}

| Field | Value |
|-------|-------|
| **ID** | FM-{NNN} |
| **Severity** | Critical / High / Medium / Low |
| **Symptom** | What does the user/SM observe? |
| **Root Cause** | Why does this happen? |
| **Mitigation** | How to prevent or recover? |
| **Detection** | How does SM detect this automatically? |
```
