---
inclusion: manual
name: sm-autonomy-L3
description: "SM Autonomy Level 3 (Unattended) — SM chạy full pipeline tự động, chỉ dừng ở UAT và Deploy."
---

# SM Autonomy Level 3 — Unattended

## Behavior

SM hoạt động ở chế độ **tự động hoàn toàn**. Chạy pipeline từ đầu đến cuối mà không hỏi user, chỉ dừng ở các human gates bắt buộc.

## Được phép (auto, không cần hỏi)

- ✅ Invoke sub-agents liên tục giữa các phases
- ✅ Auto-proceed Phase N → Phase N+1 sau khi quality gate pass
- ✅ Auto-transition Jira theo workflow mapping
- ✅ Auto-push to feature branch (branch name = {TICKET})
- ✅ Auto-attach documents to Jira sau mỗi phase
- ✅ Auto-retry khi agent fail (max 2 lần per phase)
- ✅ Auto-run feedback loops (BA↔SA, max 5 iterations)
- ✅ Write STATUS.json, RUN-LOG.md liên tục

## PHẢI dừng lại (Human Gates — KHÔNG được bypass)

- ⛔ **UAT approval** — user/PO phải test và confirm "UAT pass"
- ⛔ **Deploy approval** — user phải confirm trước khi deploy production
- ⛔ **Circuit breaker open** — phase fail ≥3 lần, cần user intervention
- ⛔ **Merge to main** — KHÔNG auto-merge, chỉ push feature branch

## KHÔNG được phép (ngay cả ở L3)

- ❌ Merge to main/master (phải có user "merge approved")
- ❌ Force push (`git push --force`)
- ❌ Delete remote branches
- ❌ Skip quality gates
- ❌ Bypass circuit breaker
- ❌ Giả định UAT pass

## Pipeline Flow ở L3

```
Phase 1 (BRD) → verify → 
Phase 2 (FSD) → verify → 
Phase 3 (TDD) → verify → feedback loop nếu cần →
Phase 3.7 (Security Review) → verify →
Phase 4 (STP/STC) → verify →
Phase 4.5 (CI/CD Setup) → verify →
Phase 5 (Code) → verify →
Phase 5.5 (UG) → verify →
Phase 5.7 (Security Code Review) → verify →
Phase 6 (Testing + Code Review) → verify →
Phase 6.3 (Pentest) → verify →
⛔ STOP → Phase 6.5 (UAT) — đợi user
→ user confirms →
Phase 6.7 (Security Deploy Review) → verify →
⛔ STOP → Phase 7 (Deploy) — đợi user
→ user confirms → Deploy + Release
```

## Progress Reporting ở L3

SM vẫn report sau MỖI phase (không hỏi, chỉ thông báo):

```
🤖 [L3 Auto] Phase {N} ({name}) ✅ — {duration}s
   Output: {document} v{version}
   Quality Gate: {pass/fail}
   Next: Phase {N+1} ({next_name})
   ─────────────────────────
```

Nếu có lỗi:

```
🤖 [L3 Auto] Phase {N} ({name}) ❌ — Attempt {X}/2
   Error: {message}
   Action: Retrying...
   ─────────────────────────
```

## Audit Trail

Ở L3, RUN-LOG.md là **bắt buộc** — đây là cách duy nhất user trace lại quyết định SM đã làm:

| # | Timestamp | Agent | Phase | Action | Result | Duration |
|---|-----------|-------|-------|--------|--------|----------|

## Khi nào dùng L3

- Ticket đã rõ ràng, không cần user can thiệp từng bước
- Batch processing nhiều tickets
- User tin tưởng pipeline quality gates
- Overnight/background processing
