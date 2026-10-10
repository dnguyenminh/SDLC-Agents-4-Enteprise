# SA4E-350 RUN-LOG

## 2026-10-10 — Bugfix pipeline (user UAT feedback → ticket → fix main → deploy)

| Time | Agent | Action | Result |
|------|-------|--------|--------|
| T0 | User (UAT) | Báo cáo: auth + config OK sau SA4E-349, nhưng Index không tìm thấy rule @baseclass + phát hiện tham số query thiếu value | Input gốc |
| T1 | Main agent (QA/diag) | Probe real server: A1 appliesTo=empty → 0 results; A2 appliesTo=@baseclass → 1 result (rule found); B1 short insKey → 404; B2 full insKey → 200 full rule. Xác nhận root cause: client strip '@baseclass' + query row là handle-only | Root cause confirmed |
| T2 | Main agent | Tạo Jira ticket SA4E-350 (Bug, High) | SA4E-350 created |
| T3 | Main agent (DEV) | Fix PegaRuleReadClient.getObject: '@baseclass' passthrough verbatim + queryByTripleWithCompatRetry (empty retry chỉ khi exact miss + original là @baseclass; auth/5xx rethrow fail-loud) + fetchFullRuleIfHandleRow (handle-only row → /rules/instance follow-up với full pzInsKey để lấy full rule content cho KB; soft fallback) | Fix applied |
| T4 | Main agent (QA) | Unit tests pega-rule-read-client.test.ts: 6/6 PASS (tsc + lint PASS; full suite 2405/2405 PASS) | PASS |
| T5 | Main agent (QA) | Runtime verify với REAL fixed client + REAL academy server (temp suite, xoá sau): 3/3 PASS — pzBulkActions + pzModalButtonsConfiguration resolve được full rule; regression pxIsMobileDevice PASS | PASS |
| T6 | Main agent (DEV) | Commit 96cc3b3 trên main (fix + 6 tests, 183+/4-) | Committed |
| T7 | Main agent (DevOps) | Bump version 1.47.1 → 1.47.2, package:prod → sdlc-agents-4-enterprise-1.47.2.vsix (22.66 MB), install into Kiro | Deployed, confirmed via --list-extensions |
| T8 | Main agent | documents/SA4E-350: STATUS.json + RUN-LOG.md + TEST-REPORT.md; Jira comment + transition; KB ingest | This step |

## Ghi chú

- Fix pattern fail-loud từ SA4E-349 được tái dùng (auth/5xx rethrow, không nuốt lỗi).
- Version bump 1.47.2 chưa commit (chờ user).
- UAT checklist trong TEST-REPORT.md §4.
