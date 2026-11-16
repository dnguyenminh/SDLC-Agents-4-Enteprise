# UG Review Steering — BA & QA Review of User Guides (MUST)

## Purpose
Ensure every `documents/{TICKET-KEY}/UG.md` produced by DEV agent complies with the UG Writing Standard (`.opencode/rules/sdlc/ug-writing-standard.md`). BA reviews for user-facing correctness; QA verifies by actually executing the guide against the running build.

Reference exemplar: `documents/SA4E-393/UG.md`

## When It Triggers
- Phase 5.5 User Guide — SM invokes DEV to write UG, then BA to review, then QA to verify.
- SM blocks Phase 5/6 completion without BA review evidence + QA verification evidence.

## BA Review — What BA Must Check

1. **End-user voice** — language is user-facing, zero implementation detail. Pass One-Line Test.
2. **Completeness** — main flows from BRD/FSD covered as step-by-step instructions; each step has User Actions table (Bước · Thao tác · Kết quả mong đợi).
3. **Real evidence** — every primary screen has REAL screenshot from running build, embedded inline; Key Elements table present; reject wireframes/mockups/draw.io exports/placeholders/`[SCREENSHOT REQUIRED]`.
4. **No forbidden content** — UG contains NO architecture/sequence/state/component diagrams, NO Configuration Reference tables, NO API/tool schemas, NO class/file internals. Link to TDD instead.
5. **Real data** — example outputs use actual runIds/numbers from real run, never fabricated.
6. **Troubleshooting by symptom** — table Hiện tượng | Nguyên nhân | Cách xử lý, described by what USER SEES, not error codes.
7. **No placeholder text** — no `{...}` or `TODO`.
8. **Screenshots match use cases** — each image matches BRD/FSD use case and real UI.
9. **Edit & ingest** — BA may edit UG directly, then ingest into KB.

Evidence to report to SM: list of checks passed/failed + file path.

## QA Verification — What QA Must Verify

QA does NOT just read the doc — QA must execute the guide against the running build.

1. Resolve start command from project, detect existing instance, reuse it, verify freshness per `ug-evidence.md`.
2. Verify running build contains ticket feature (route/tool/command/UI element).
3. Execute each step in UG per User Actions table, verify Kết quả mong đợi matches actual output; capture actual screenshot to compare.
4. Verify each screenshot in UG is real from current build; Key Elements table correct.
5. Verify UG contains NO technical content forbidden by standard.
6. Verify example data is real.
7. Report PASS/FAIL per step with evidence (actual output + screenshot).

Evidence to report to SM: verification log with step results.

## Hard Failures
- Missing User Actions tables
- Architecture diagrams / config references / API schemas in UG
- Wireframe/mockup/placeholder screenshots
- Stale screenshots not matching current build
- Fabricated example data

SM blocks Phase 5/6 if any hard failure remains unresolved.