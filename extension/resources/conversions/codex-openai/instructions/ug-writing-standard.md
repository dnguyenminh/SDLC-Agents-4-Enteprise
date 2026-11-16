# UG Writing Standard — How Agents Write User Guides (MUST)

## Purpose

Defines HOW agents write `documents/{TICKET-KEY}/UG.md`. A User Guide is written for **END USERS** — people who USE the product — not for engineers who build it. This standard exists because agents repeatedly produced technical documents (API schemas, config references, architecture diagrams) labeled as "User Guide". The reference exemplar is `documents/SA4E-393/UG.md` (v1.55.19).

## The One-Line Test

> **"Could a non-engineer user of the product follow this document and succeed?"**
> If any section answers NO — delete it or rewrite it. If in doubt, cut it.

## Golden Rules

| # | Rule | Rationale |
|---|------|-----------|
| 1 | **End-user voice** — describe what the user SEES and DOES, never how it is implemented | UG ≠ TDD. Config keys, class names, env vars are TDD material |
| 2 | **Real screenshots from the running build, embedded inline** at the step they illustrate | Screenshots teach; text describes. Never ship a UG with zero images when the product has a UI |
| 3 | **draw.io diagrams (architecture/sequence/state/component/use-case) are FORBIDDEN in UG** — they live in TDD/BRD/FSD | Users cannot operate a product from an architecture diagram. At most, LINK to them in "Related documents" |
| 4 | **Every step = User Actions table** (Bước/Step · Thao tác/Action · Kết quả mong đợi/Expected result) | Users need expected results to know they did it right |
| 5 | **Every screenshot = Key Elements table** (Thành phần · Vị trí trên ảnh · Ý nghĩa) | An annotated screenshot replaces paragraphs of prose |
| 6 | **Real data only** — example outputs must come from an actual run (real runIds, real numbers, real file paths) | Fabricated examples erode trust and mislead |
| 7 | **Screenshots captured via computer-use automation** (`orca computer`) from the actually running build — same freshness rules as `ug-evidence.md` | Stale or mocked screenshots are a UG defect (hard failure per policy) |
| 8 | **Document language = user's language** (Vietnamese in this project); product terms/UI labels stay in English as they appear on screen | UG is read by users, not compilers |
| 9 | **No `[SCREENSHOT REQUIRED]` placeholder when capture is possible.** If genuinely impossible → marker + reason + report gap to SM | Silent gaps are hard failures; lazy placeholders are worse than none |
| 10 | **Length target: 2–4 pages.** If longer, split troubleshooting/FAQ or cut prose | Users skim; walls of text hide the steps |

## Required Structure

```
# User Guide — {Feature Name}
> Dành cho: {who} · Phiên bản: {ver} · UAT: {status} · Ticket: {key}

## 1. {Feature} là gì?            ← 2-4 sentences, zero internals
## 2. Cài đặt & kiểm tra phiên bản ← only if installation matters to the user
## 3. {Main flow} — từng bước      ← Bước 1..N, each: User Actions table + screenshot + Key Elements
## 4. {Secondary flow}             ← same pattern (e.g., agent self-check, worktree)
## 5. Xử lý sự cố                  ← table: Hiện tượng | Nguyên nhân | Cách xử lý
## 6. FAQ                          ← 4-6 real questions in user words
## 7. Tài liệu liên quan           ← BRD/FSD/TDD/RUN-LOG pointers (diagrams live here)
```

## Screenshot Capture Procedure (UI deliverables)

1. **Reuse a running instance** per `ug-evidence.md` (health endpoint / port / PID — never start a second instance).
2. Verify the instance contains the ticket feature (freshness check table in `ug-evidence.md`).
3. Drive the app with `orca computer`:
   ```
   orca computer list-apps --json
   orca computer hotkey --app <App> --key CmdOrCtrl+Shift+P --restore-window --json
   orca computer get-app-state --app <App> --query "<text>" --json   # find element indexes
   orca computer click --app <App> --element-index <n> --json        # or --x/--y from screenshot
   ```
   - Element indexes go stale between invocations → re-run `get-app-state` before each click; fall back to `--x/--y` coordinates from the latest screenshot (mind `scale`).
4. Save captures to `documents/{TICKET-KEY}/diagrams/screenshot-{step}.png`, then embed:
   `![mô tả bước](diagrams/screenshot-{step}.png)`
5. Tell the user before `--restore-window` (it takes over their screen).

**Minimum screenshot set for a UI feature:** the entry point (menu/palette/button) · the result/primary screen · at least one error-or-edge state if it changes what the user must do.

## What Belongs Where (UG vs TDD)

| Content | UG | TDD |
|---------|----|-----|
| Step-by-step operations + expected results | ✅ | — |
| Screenshots of the running product | ✅ | — |
| Severity/score interpretation for the user | ✅ | — |
| Troubleshooting by symptom | ✅ | — |
| Architecture / sequence / state / class diagrams | — | ✅ |
| Config property reference, env vars, defaults | Link only | ✅ |
| API/tool schemas, error-code catalogs | Link only | ✅ |
| Source file paths, class/function names | Only when user-visible | ✅ |

## Self-Check Before Reporting Done

1. Every embedded image path exists on disk (`Test-Path`) — broken links are a defect.
2. Zero draw.io architecture images in the document.
3. Every step has an expected result; every screenshot has a Key Elements table.
4. All example data traceable to a real run (runId/file/number).
5. Read your own doc as a first-time user: could you complete the main flow using ONLY this document?
6. Ingest the finished UG into KB (`mem_ingest_file`, type `PROCEDURE`) per agent-self-learning rules.

## Traceability

- Exemplar: `documents/SA4E-393/UG.md` + `diagrams/screenshot-*.png` (captured 2026-11-14 from running 1.55.19)
- Evidence policy: `.opencode/rules/sdlc/ug-evidence.md` (hard failures list)
- Lesson source: SA4E-393 UG review session — 4 rejected drafts before the accepted end-user format
