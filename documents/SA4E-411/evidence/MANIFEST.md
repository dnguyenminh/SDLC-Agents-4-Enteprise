# Evidence Manifest — SA4E-411

> **Trạng thái thư mục `evidence/`: UNTRACKED.**
> `git status` hiện báo `?? documents/SA4E-411/evidence/` — reviewer mở branch ở trạng thái
> **committed** sẽ **không thấy** thư mục này. Chưa commit theo yêu cầu của user.
> Lệnh khuyến nghị (SM/user tự quyết định, **không** tự chạy ở pass này):
> `git add documents/SA4E-411/evidence/`

**Ngày xác minh:** 2026-11-16T12:33:47.6022685Z

## 1. Tổng quan

| Chỉ số | Giá trị |
|--------|---------|
| Tổng số file evidence (không tính manifest.sha256 / MANIFEST.md / screenshots-manifest.md) | 78 |
| File trạng thái VERIFIED | 41 |
| File trạng thái NOT_REPRODUCIBLE | 37 |
| Lệnh được chạy lại | 20 |
| Lệnh chạy lại exit 0 | 20 |
| Lệnh chạy lại exit khác 0 | 0 |
| mismatches | `[]` (không có sai lệch) |
| Ảnh UG chụp mới (fresh) | 3 |
| Ảnh cũ đã xoá (STALE-IMAGE) | 4 |

## 2. Lệnh đã chạy lại (`.rerun-report.json`, `generatedAt` = 11/16/2026 07:11:06)

| # | Label | Lệnh | Exit | Khớp bản gốc | Tóm tắt | File transcript |
|---|-------|------|------|----------------|---------|----------------|
| 1 | `ac01-08` | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-ac01-08.txt` |
| 2 | `pipeline` | `npx vitest run src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts src/engine/pipeline/__tests__/index-pipeline.order.test.ts src/engine/chunking/__tests__/ast-chunker.test.ts --reporter=verbose` | 0 | Có | Test Files  3 passed (3) | `.rerun-pipeline.txt` |
| 3 | `retrieval` | `npx vitest run src/engine/retrieval/__tests__/snapshot-retrieval.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-retrieval.txt` |
| 4 | `query` | `npx vitest run src/engine/api/__tests__/pinned-snapshot-guard.test.ts src/engine/agent-tools/__tests__/core-tools.test.ts src/engine/map/__tests__/repo-map-service.test.ts src/engine/map/__tests__/repo-map-rank.test.ts --reporter=verbose` | 0 | Có | Test Files  4 passed (4) | `.rerun-query.txt` |
| 5 | `coretools` | `npx vitest run src/engine/map/__tests__/repo-map-service.test.ts src/engine/agent-tools/__tests__/core-tools.test.ts src/engine/map/__tests__/repo-map-rank.test.ts --reporter=verbose` | 0 | Có | Test Files  3 passed (3) | `.rerun-coretools.txt` |
| 6 | `scratchpad` | `npx vitest run src/engine/scratchpad/__tests__/scratchpad.test.ts src/engine/scratchpad/__tests__/eviction.test.ts src/engine/scratchpad/__tests__/token-eviction.integration.test.ts --reporter=verbose` | 0 | Có | Test Files  3 passed (3) | `.rerun-scratchpad.txt` |
| 7 | `security` | `npx vitest run src/engine/security/__tests__/staged-patch.test.ts src/engine/security/__tests__/patch-protocol.test.ts src/engine/security/__tests__/sandbox.test.ts --reporter=verbose` | 0 | Có | Test Files  3 passed (3) | `.rerun-security.txt` |
| 8 | `stagedpatch` | `npx vitest run src/engine/security/__tests__/staged-patch.test.ts src/engine/security/__tests__/patch-protocol.test.ts --reporter=verbose` | 0 | Có | Test Files  2 passed (2) | `.rerun-stagedpatch.txt` |
| 9 | `sandbox` | `npx vitest run src/engine/security/__tests__/sandbox.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-sandbox.txt` |
| 10 | `agent` | `npx vitest run src/engine/agent/__tests__/sse-stream.test.ts src/engine/agent/__tests__/agent-state-recovery.test.ts src/engine/agent/__tests__/agent-persistence.test.ts --reporter=verbose` | 0 | Có | Test Files  3 passed (3) | `.rerun-agent.txt` |
| 11 | `resume` | `npx vitest run src/engine/agent/__tests__/agent-persistence.test.ts src/engine/agent/__tests__/agent-state-recovery.test.ts --reporter=verbose` | 0 | Có | Test Files  2 passed (2) | `.rerun-resume.txt` |
| 12 | `sse` | `npx vitest run src/engine/agent/__tests__/sse-stream.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-sse.txt` |
| 13 | `pinned` | `npx vitest run src/engine/api/__tests__/pinned-snapshot-guard.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-pinned.txt` |
| 14 | `ac09-12` | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-ac09-12.txt` |
| 15 | `ac13-16` | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-ac13-16.txt` |
| 16 | `regression` | `npx vitest run src/engine/regression/__tests__/sa4e-regression.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-regression.txt` |
| 17 | `tokenbudget` | `npx vitest run src/pi-agent/__tests__/acceptance-ac17.test.ts src/pi-agent/__tests__/session-budget-gate.test.ts src/pi-agent/__tests__/budget-gate-runtime-count.test.ts src/pi-agent/__tests__/budget-gate-escalation.test.ts src/pi-agent/__tests__/budget-gate-enforce.test.ts src/pi-agent/__tests__/budget-gate-decisions.test.ts src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts src/pi-agent/__tests__/runtime-tokenizer.test.ts src/pi-agent/__tests__/token-eviction.integration.test.ts --reporter=verbose` | 0 | Có | Test Files  9 passed (9) | `.rerun-tokenbudget.txt` |
| 18 | `ext-regression` | `npx vitest run src/__tests__/sa4e-regression.test.ts --reporter=verbose` | 0 | Có | Test Files  1 passed (1) | `.rerun-ext-regression.txt` |
| 19 | `demo` | `npx tsx ..\documents\SA4E-411\evidence\demo-driver-core-tools.mts` | 0 | Có |  | `.rerun-demo.txt` |
| 20 | `demo2` | `npx tsx ..\documents\SA4E-411\evidence\demo-driver-patch-sse-resume.mts` | 0 | Có |  | `.rerun-demo2.txt` |

## 3. File evidence (chi tiết)

| File | SHA-256 | Bytes | Nguồn / lệnh đã chạy | Exit | Xác minh lúc | Trạng thái |
|------|---------|-------|---------------------|------|-------------|------------|
| `.freshness-backend-48731.json` | `30F8A41A5CD2239A…` | 1440 | node evidence/freshness-probe.mjs <isolated index.db> http://127.0.0.1:48731 | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `.kiro-isolated-start.txt` | `408DFD839AC7942D…` | 261 | pwsh evidence/start-isolated-kiro.ps1 | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `.kiro-restart-reason.txt` | `CBE1BB81A11C476E…` | 521 | pwsh evidence/start-isolated-kiro.ps1 | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `.raw-ac01-08.txt` | `08C5B218F04DB366…` | 3419 | original baseline capture (superseded by .rerun-ac01-08.txt) | 0 | 2026-11-15T19:52:00.9060367Z | **NOT_REPRODUCIBLE** |
| `.raw-ac09-12.txt` | `2B68769677F4864E…` | 2991 | original baseline capture (superseded by .rerun-ac09-12.txt) | 0 | 2026-11-15T19:52:00.9363942Z | **NOT_REPRODUCIBLE** |
| `.raw-ac13-16.txt` | `A48549A180BAA65F…` | 2857 | original baseline capture (superseded by .rerun-ac13-16.txt) | 0 | 2026-11-15T19:52:00.9379665Z | **NOT_REPRODUCIBLE** |
| `.raw-agent.txt` | `DA8DF164BC35DDEE…` | 8026 | original baseline capture (superseded by .rerun-agent.txt) | 0 | 2026-11-15T19:52:00.9321595Z | **NOT_REPRODUCIBLE** |
| `.raw-coretools.txt` | `6CA59E5984E5450D…` | 6000 | original baseline capture (superseded by .rerun-coretools.txt) | 0 | 2026-11-15T19:52:00.9250052Z | **NOT_REPRODUCIBLE** |
| `.raw-demo.txt` | `F7D84D476E8F69B4…` | 2127 | original baseline capture (superseded by .rerun-demo.txt) | 0 | 2026-11-15T19:52:00.9429297Z | **NOT_REPRODUCIBLE** |
| `.raw-demo2.txt` | `74C7FBA2F9ED7AF4…` | 5129 | original baseline capture (superseded by .rerun-demo2.txt) | 0 | 2026-11-15T19:52:00.9446386Z | **NOT_REPRODUCIBLE** |
| `.raw-ext-regression.txt` | `B67FEA62B6BC2649…` | 2348 | original baseline capture (superseded by .rerun-ext-regression.txt) | 0 | 2026-11-15T19:52:00.9418551Z | **NOT_REPRODUCIBLE** |
| `.raw-pinned.txt` | `0595B1F88D69D3F2…` | 2340 | original baseline capture (superseded by .rerun-pinned.txt) | 0 | 2026-11-15T19:52:00.9353470Z | **NOT_REPRODUCIBLE** |
| `.raw-pipeline.txt` | `12B49C2171B8F4E6…` | 8481 | original baseline capture (superseded by .rerun-pipeline.txt) | 0 | 2026-11-15T19:52:00.9118746Z | **NOT_REPRODUCIBLE** |
| `.raw-query.txt` | `674ABB198F669274…` | 8779 | original baseline capture (superseded by .rerun-query.txt) | 0 | 2026-11-15T19:52:00.9227777Z | **NOT_REPRODUCIBLE** |
| `.raw-regression.txt` | `84EDF920BD3EFB08…` | 7972 | original baseline capture (superseded by .rerun-regression.txt) | 0 | 2026-11-15T19:52:00.9390586Z | **NOT_REPRODUCIBLE** |
| `.raw-resume.txt` | `DE47D24A3BF210B5…` | 4065 | original baseline capture (superseded by .rerun-resume.txt) | 0 | 2026-11-15T19:52:00.9332277Z | **NOT_REPRODUCIBLE** |
| `.raw-retrieval.txt` | `CD8BB58BA2FCF0A8…` | 4410 | original baseline capture (superseded by .rerun-retrieval.txt) | 0 | 2026-11-15T19:52:00.9133702Z | **NOT_REPRODUCIBLE** |
| `.raw-sandbox.txt` | `620A949995AA3D82…` | 2143 | original baseline capture (superseded by .rerun-sandbox.txt) | 0 | 2026-11-15T19:52:00.9305694Z | **NOT_REPRODUCIBLE** |
| `.raw-scratchpad.txt` | `09685B32EEF68109…` | 3763 | original baseline capture (superseded by .rerun-scratchpad.txt) | 0 | 2026-11-15T19:52:00.9265710Z | **NOT_REPRODUCIBLE** |
| `.raw-security.txt` | `2DEF972FAFB95099…` | 11620 | original baseline capture (superseded by .rerun-security.txt) | 0 | 2026-11-15T19:52:00.9281492Z | **NOT_REPRODUCIBLE** |
| `.raw-sse.txt` | `213D0E21C9396D7D…` | 3238 | original baseline capture (superseded by .rerun-sse.txt) | 0 | 2026-11-15T19:52:00.9342797Z | **NOT_REPRODUCIBLE** |
| `.raw-stagedpatch.txt` | `6C521897FDE842CB…` | 9440 | original baseline capture (superseded by .rerun-stagedpatch.txt) | 0 | 2026-11-15T19:52:00.9294314Z | **NOT_REPRODUCIBLE** |
| `.raw-tokenbudget.txt` | `C680C39BDF88D552…` | 16934 | original baseline capture (superseded by .rerun-tokenbudget.txt) | 0 | 2026-11-15T19:52:00.9402846Z | **NOT_REPRODUCIBLE** |
| `.rerun-ac01-08.txt` | `4A0C29294EF07BE3…` | 4745 | npx vitest run src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:29 | **VERIFIED** |
| `.rerun-ac09-12.txt` | `4D42B9466ACABBEB…` | 3363 | npx vitest run src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:54 | **VERIFIED** |
| `.rerun-ac13-16.txt` | `946179D615814931…` | 3234 | npx vitest run src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:57 | **VERIFIED** |
| `.rerun-agent.txt` | `4DC9F46DD149C8A0…` | 8456 | npx vitest run src/engine/agent/__tests__/sse-stream.test.ts src/engine/agent/__tests__/agent-state-recovery.test.ts src/engine/agent/__tests__/agent-persistence.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:47 | **VERIFIED** |
| `.rerun-coretools.txt` | `A0846E896ADCEAB6…` | 7075 | npx vitest run src/engine/map/__tests__/repo-map-service.test.ts src/engine/agent-tools/__tests__/core-tools.test.ts src/engine/map/__tests__/repo-map-rank.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:38 | **VERIFIED** |
| `.rerun-demo.txt` | `7F53816CB010DDCB…` | 2507 | npx tsx ..\documents\SA4E-411\evidence\demo-driver-core-tools.mts | 0 | 11/16/2026 07:11:04 | **VERIFIED** |
| `.rerun-demo2.txt` | `483BEC34CA1ACC4B…` | 5501 | npx tsx ..\documents\SA4E-411\evidence\demo-driver-patch-sse-resume.mts | 0 | 11/16/2026 07:11:06 | **VERIFIED** |
| `.rerun-ext-regression.txt` | `2A04D6C0AB56E71B…` | 2703 | npx vitest run src/__tests__/sa4e-regression.test.ts --reporter=verbose | 0 | 11/16/2026 07:11:03 | **VERIFIED** |
| `.rerun-pinned.txt` | `6DCE6556064F2C62…` | 3058 | npx vitest run src/engine/api/__tests__/pinned-snapshot-guard.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:52 | **VERIFIED** |
| `.rerun-pipeline.txt` | `FA2BCDC50AFB9B6D…` | 9599 | npx vitest run src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts src/engine/pipeline/__tests__/index-pipeline.order.test.ts src/engine/chunking/__tests__/ast-chunker.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:31 | **VERIFIED** |
| `.rerun-query.txt` | `946128704D946E64…` | 9252 | npx vitest run src/engine/api/__tests__/pinned-snapshot-guard.test.ts src/engine/agent-tools/__tests__/core-tools.test.ts src/engine/map/__tests__/repo-map-service.test.ts src/engine/map/__tests__/repo-map-rank.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:35 | **VERIFIED** |
| `.rerun-regression.txt` | `AA8C75EDC4C96A89…` | 8307 | npx vitest run src/engine/regression/__tests__/sa4e-regression.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:59 | **VERIFIED** |
| `.rerun-report.json` | `56F92078B9A1FD4B…` | 17581 | node evidence/rerun-evidence.mjs | 0 | 11/16/2026 07:11:06 | **VERIFIED** |
| `.rerun-resume.txt` | `28AF97B7936A9D31…` | 5390 | npx vitest run src/engine/agent/__tests__/agent-persistence.test.ts src/engine/agent/__tests__/agent-state-recovery.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:49 | **VERIFIED** |
| `.rerun-retrieval.txt` | `BD42FF64BBE4BC42…` | 5124 | npx vitest run src/engine/retrieval/__tests__/snapshot-retrieval.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:32 | **VERIFIED** |
| `.rerun-sandbox.txt` | `C8F15318A70FD810…` | 2661 | npx vitest run src/engine/security/__tests__/sandbox.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:45 | **VERIFIED** |
| `.rerun-scratchpad.txt` | `77E86F23AB101082…` | 4239 | npx vitest run src/engine/scratchpad/__tests__/scratchpad.test.ts src/engine/scratchpad/__tests__/eviction.test.ts src/engine/scratchpad/__tests__/token-eviction.integration.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:39 | **VERIFIED** |
| `.rerun-security.txt` | `AE9EB526A0C351BF…` | 12034 | npx vitest run src/engine/security/__tests__/staged-patch.test.ts src/engine/security/__tests__/patch-protocol.test.ts src/engine/security/__tests__/sandbox.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:42 | **VERIFIED** |
| `.rerun-sse.txt` | `67F7D95A155782E7…` | 3931 | npx vitest run src/engine/agent/__tests__/sse-stream.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:50 | **VERIFIED** |
| `.rerun-stagedpatch.txt` | `EE647A5DF6D8115B…` | 10249 | npx vitest run src/engine/security/__tests__/staged-patch.test.ts src/engine/security/__tests__/patch-protocol.test.ts --reporter=verbose | 0 | 11/16/2026 07:10:43 | **VERIFIED** |
| `.rerun-tokenbudget.txt` | `E0327287A09C7D73…` | 17649 | npx vitest run src/pi-agent/__tests__/acceptance-ac17.test.ts src/pi-agent/__tests__/session-budget-gate.test.ts src/pi-agent/__tests__/budget-gate-runtime-count.test.ts src/pi-agent/__tests__/budget-gate-escalation.test.ts src/pi-agent/__tests__/budget-gate-enforce.test.ts src/pi-agent/__tests__/budget-gate-decisions.test.ts src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts src/pi-agent/__tests__/runtime-tokenizer.test.ts src/pi-agent/__tests__/token-eviction.integration.test.ts --reporter=verbose | 0 | 11/16/2026 07:11:02 | **VERIFIED** |
| `.state-01-entry-sdlc-agents-panel.txt` | `7AA9582F3F9FF9DD…` | 12985 | orca computer get-app-state --app pid:29420 --json (TEXT ONLY) | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `.state-02-primary-ai-context.txt` | `50169851F0501B0C…` | 13132 | orca computer get-app-state --app pid:29420 --json (TEXT ONLY) | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `.state-03-no-active-editor.txt` | `E2C1D84241B7A271…` | 11922 | orca computer get-app-state --app pid:29420 --json (TEXT ONLY) | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `.state-after-click.txt` | `0DF3A46F88AF04F4…` | 12553 | orca computer get-app-state --app pid:29420 --json (TEXT ONLY) | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `acceptance-ac09-16.md` | `994841AE79454615…` | 6837 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:17:34.7244102Z | **NOT_REPRODUCIBLE** |
| `build-manifest.ps1` | `93D90296A159F9A9…` | 13463 | file present in the evidence folder |  | 2026-11-16T11:49:34.5592749Z | **NOT_REPRODUCIBLE** |
| `capture-kiro.ps1` | `6CCA6C383A7E9B08…` | 3920 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `db-count.mjs` | `6362DF9CAE80E84F…` | 578 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `db-inspect.mjs` | `CC2F951E642FDB10…` | 1053 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `demo-driver-core-tools.mts` | `BCDE10AE1570057E…` | 3794 | acceptance driver script (source of the corresponding .raw-*.txt transcript) |  | 2026-11-15T18:59:50.0847948Z | **NOT_REPRODUCIBLE** |
| `demo-driver-patch-sse-resume.mts` | `365687FCD2644663…` | 12828 | acceptance driver script (source of the corresponding .raw-*.txt transcript) |  | 2026-11-15T19:05:12.8842971Z | **NOT_REPRODUCIBLE** |
| `exit-codes.json` | `E6335F0616B8D5B9…` | 6581 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:29:43.2757628Z | **NOT_REPRODUCIBLE** |
| `find-click.ps1` | `DDBCF9B9ABE8EA2E…` | 1703 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `freshness-probe.mjs` | `7C396B4E2161724A…` | 1967 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `index-pipeline-order.md` | `5409629D841E700D…` | 9725 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T19:57:33.9553765Z | **NOT_REPRODUCIBLE** |
| `index-snapshot.md` | `CB2BB48DFFF45693…` | 6770 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T19:55:27.4162851Z | **NOT_REPRODUCIBLE** |
| `mcp-probe.mjs` | `78D8D8F102F45F92…` | 1344 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `query-core-tools.md` | `73C88A0DA8EAB50D…` | 13271 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:02:41.5316217Z | **NOT_REPRODUCIBLE** |
| `README.md` | `6A3F1AA97EF2E876…` | 8844 | hand-written evidence index (updated in this pass) |  | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `regression.md` | `5807E7E48B3EB3AE…` | 8553 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:19:30.7171709Z | **NOT_REPRODUCIBLE** |
| `rerun-evidence.mjs` | `F0926B88AA188887…` | 4411 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `restart-resume.md` | `D5CB3A0F9FFEF877…` | 8090 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:12:45.6001823Z | **NOT_REPRODUCIBLE** |
| `retrieval-snapshot-scoped.md` | `07706BF3C99BF390…` | 6743 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T19:58:59.3470058Z | **NOT_REPRODUCIBLE** |
| `sandbox.md` | `23BBC29E4498D284…` | 5790 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:10:45.0355634Z | **NOT_REPRODUCIBLE** |
| `scratchpad-context-budget.md` | `13882D0711FEBE5A…` | 19022 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:07:10.2302785Z | **NOT_REPRODUCIBLE** |
| `seed-index.mjs` | `1DE8BE653CBF96D8…` | 941 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `snapshot-pin-mismatch.md` | `05B22EE857680AC5…` | 6058 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:15:49.7073883Z | **NOT_REPRODUCIBLE** |
| `sse-replay.md` | `EFAAE5B20D7BFEA2…` | 6706 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:14:21.5831515Z | **NOT_REPRODUCIBLE** |
| `staged-patch-approval.md` | `070EBB7797E41D51…` | 11093 | report produced by the acceptance driver in a previous pass |  | 2026-11-15T20:09:36.5725569Z | **NOT_REPRODUCIBLE** |
| `start-isolated-backend.ps1` | `865D0DA9BEFFD837…` | 1867 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `start-isolated-kiro.ps1` | `6496EB0B81B5B09D…` | 3151 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `ug-flow-ai-context.ps1` | `3ACBA1C16DC7A807…` | 6896 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |
| `verification-head-ebd36f38.md` | `F942D7BC98BF3F3F…` | 2084 | report produced by the acceptance driver in a previous pass |  | 2026-11-16T12:30:47.5809693Z | **NOT_REPRODUCIBLE** |
| `verify-evidence.mjs` | `38FB122947EFFCAC…` | 6844 | tooling script executed in this pass | 0 | 2026-11-16T12:33:47.6022685Z | **VERIFIED** |

## 4. Ảnh cũ đã gỡ (STALE-IMAGE)

Bốn ảnh dưới đây được chụp từ Kiro trên repo `main` với backend dùng chung `:48721` — không đại diện
cho build SA4E-411 nên đã **xoá khỏi branch**:

| File đã xoá | Lý do | Trạng thái |
|-------------|-------|------------|
| `documents/SA4E-411/diagrams/screenshot-sa411-01-command-palette-entry.png` | chụp từ Kiro repo `main` + backend dùng chung `:48721` | **STALE-IMAGE** (đã xoá) |
| `documents/SA4E-411/diagrams/screenshot-sa411-02-show-status.png` | chụp từ Kiro repo `main` + backend dùng chung `:48721` | **STALE-IMAGE** (đã xoá) |
| `documents/SA4E-411/diagrams/screenshot-sa411-03-enrichment-dashboard.png` | chụp từ Kiro repo `main` + backend dùng chung `:48721` | **STALE-IMAGE** (đã xoá) |
| `documents/SA4E-411/diagrams/screenshot-sa411-05-sdlc-chat-panel.png` | chụp từ Kiro repo `main` + backend dùng chung `:48721` | **STALE-IMAGE** (đã xoá) |

## 5. Kiểm tra lại checksum

```bash
cd documents/SA4E-411/evidence
sha256sum -c manifest.sha256   # GNU/Linux
# PowerShell:
Get-Content manifest.sha256 | ForEach-Object { $p = $_ -split "  ",2; if ((Get-FileHash $p[1] -Algorithm SHA256).Hash -ne $p[0]) { "MISMATCH " + $p[1] } }
```

