# Worktree Parallel Pipeline Strategy — SDLC-Agents-4-Enterprise

> Owner: SM (workflow documentation per sm-core `workflow` action)
> Created: 2026-10-12 · Triggered by: SA4E-356 UG v1.1 §3.4 (multi-worktree path rules)
> Audience: SM + tất cả agents chạy pipeline song song trên nhiều git worktree

---

## 1. Mục tiêu

Chạy nhiều SDLC pipeline (nhiều ticket) **song song** trên nhiều git worktree mà không xung đột:
STATUS/RUN-LOG, Jira transitions, KB entries, extension build, và code merge.

## 2. Ma trận xung đột tiềm ẩn

| # | Resource | Phạm vi | Xung đột khi song song? | Biện pháp |
|---|----------|---------|------------------------|-----------|
| 1 | Git branch | Per-repo (global) | ✅ Git TỰ CHẶN checkout cùng branch ở 2 worktree → claim lock tự nhiên | Rule R1 |
| 2 | `documents/{TICKET}/STATUS.json`, `RUN-LOG.md` | **Per-worktree** | Không xung đột NẾU 1 ticket = 1 worktree (R1). KHÔNG nhìn thấy nhau xuyên worktree | Rule R4 (Jira = source of truth) |
| 3 | Jira ticket (transitions, comments, attachments) | Global | ❌ 2 SM session cùng ticket → transition race, comment loạn, attach trùng | Rule R3 |
| 4 | KB (`mem_*` — central DB) | Global (shared) | ⚠️ Cùng doc ingest từ 2 worktree với nội dung khác → version confusion. Side-lợi: coordination | Rule R5 |
| 5 | Extension build (VSIX) | **Global per-user** (Kiro cài 1 version) | ❌ 2 worktree cùng sửa `extension/src/` → VSIX cuối deploy thiếu fix của worktree kia | Rule R6 |
| 6 | MCP server | Extension-mode: **per-window** (đúng workspace sau fix SA4E-356); standalone backend: bind 1 workspace duy nhất | ⚠️ Standalone (port từ `.code-intel/settings.json`) CHỈ đúng cho workspace nó bind — không dùng chéo worktree | Rule R2 |
| 7 | Code files (`extension/src/...`) | Per-worktree | ❌ Merge conflicts nếu 2 ticket đụng cùng file | Rule R7 |
| 8 | CI (.github/workflows) | Trigger push main + PR | ✅ Branch push không đụng nhau | — |
| 9 | `jira.conf`, `.env`, secrets | Per-worktree copy | ✅ Không xung đột (local) | — |
| 10 | Junk files root (TEMPJSON, debug.log...) | Per-worktree | ⚠️ Rác tích lũy | gitignore + dọn định kỳ |

## 3. 7 nguyên tắc (R1–R7)

**R1 — 1 ticket = 1 worktree = 1 branch.** Branch tên = ticket key (`SA4E-356`). Git tự chặn
double-checkout cùng branch → không ai chạy đè pipeline của ticket đã claim. KHÔNG BAO GIỜ chạy
2 pipeline cho cùng 1 ticket ở 2 worktree.

**R2 — 1 worktree = 1 cửa sổ Kiro riêng, KHÔNG multi-root.** Sau fix SA4E-356 (UG.md §3.4):
relative paths resolve theo workspace đang open của cửa sổ đó → `documents/{TICKET}/...` tự động
đúng worktree. Multi-root (nhiều folder chung cửa sổ) chỉ dùng folder[0] → tránh. Cross-worktree:
KHÔNG dùng path — mở cửa sổ của worktree đó (absolute ngoài root bị containment reject per FR-05).

**R3 — Jira là source of truth cho trạng thái cross-worktree; 1 SM session/ticket.** Khi SM bắt
đầu pipeline ở worktree nào → post **claim comment** trên ticket ("pipeline started in worktree
{folder}, branch {branch}"). Mọi transition/comment/attach chỉ từ worktree sở hữu ticket. SM cần
global view → đọc Jira board + `mem_search` (KB), KHÔNG đọc STATUS.json của worktree khác qua
absolute path (sẽ stale).

**R4 — STATUS.json/RUN-LOG.md là worktree-local, append-only.** Mỗi worktree tự quản docs của
ticket mình. Khi merge về main: merge các file này theo **union append** (không ghi đè row —
RUN-LOG là audit trail bất biến).

**R5 — KB-first trước khi ingest, tag source = ticket.** Trước khi `mem_ingest_file`, luôn
`mem_search("{TICKET} {DOC}")` — nếu thấy entry mới hơn từ worktree khác (content version khác) →
rebase doc từ KB về worktree của mình thay vì ghi đè. KB entry source luôn kèm ticket key.

**R6 — Extension build/deploy là global: chỉ deploy từ integration point.** VSIX cài vào Kiro là
DUY NHẤT per user. Khi ≥2 worktree cùng sửa `extension/src/`:
- Cách chuẩn: hoàn tất pipeline → merge từng branch về main theo thứ tự UAT pass → build
  `package:prod` từ main (đã chứa cả 2 fix) → deploy lần cuối → UAT verify trên main build.
- Tránh deploy VSIX từ worktree feature (sẽ thiếu fix của worktree khác — hay gặp khi 2 ticket
  sửa cùng module, như SA4E-356 sửa PathResolver + ticket khác sửa proxy).
- Lưu ý extension host: sau deploy phải Reload Window TỪNG cửa sổ Kiro.

**R7 — Tránh 2 ticket song song đụng cùng file nguồn.** Trước khi start pipeline, SM check
`mem_search` + Jira: ticket nào đang IN PROGRESS đụng module nào (từ TDD §5 file-by-file table).
Nếu trùng → tuần tự hóa hoặc tách scope. Merge conflicts ở `extension/src/services/` là đắt nhất.

## 4. Quy trình vận hành chuẩn (step-by-step)

```powershell
# Step 1 — Tạo worktree + branch (từ main mới nhất)
git -C C:\projects\kiro\SDLC-Agents-4-Enterprise fetch origin main
git -C C:\projects\kiro\SDLC-Agents-4-Enterprise worktree add C:\projects\kiro\wt-SA4E-XXX -b SA4E-XXX origin/main
# Worktree folder = thư mục THỰC → sau fix SA4E-356, mọi path resolution đúng ngay

# Step 2 — Mở cửa sổ Kiro riêng cho worktree đó (R2)
# Kiro mở folder C:\projects\kiro\wt-SA4E-XXX → workspaceFolders[0] = worktree

# Step 3 — SM session trong worktree: init state
# STATUS.json + RUN-LOG.md tạo trong wt-SA4E-XXX\documents\SA4E-XXX\ (worktree-local)
# Jira: post claim comment (R3). KB: mem_search trước (R5)

# Step 4 — Pipeline chạy như thường (Phase 1→6.3), docs nằm trong worktree

# Step 5 — Jira: attach docs + transition từ worktree sở hữu

# Step 6 — UAT: build+deploy từ MAIN sau merge (R6), không từ worktree feature
# → user reload window → REG replay

# Step 7 — Merge + cleanup
git -C C:\projects\kiro\SDLC-Agents-4-Enterprise checkout main
git merge SA4E-XXX          # resolve conflicts nếu R7 vi phạm
git worktree remove C:\projects\kiro\wt-SA4E-XXX
git branch -d SA4E-XXX
```

## 5. Lựa chọn tooling (optional)

- **Git worktree thuần** — chuẩn nêu trên, không dependency.
- **Orca** (nếu đang dùng Orca app): `orca` CLI quản lý worktree, terminal, artifacts — thay
  Step 1/2/7 bằng lệnh orca; pipeline agents spawn trong worktree context vẫn áp dụng R1–R7.

## 6. Anti-patterns (cấm)

- ❌ 2 worktree cùng branch (git chặn, đừng --force worktree metadata)
- ❌ 2 SM session cùng ticket
- ❌ Deploy VSIX từ worktree feature khi có >1 ticket sửa extension
- ❌ Ghi STATUS.json của ticket ở worktree khác qua absolute path
- ❌ Multi-root workspace chứa 2 worktree (folder[0]-only sẽ gây nhầm resolve)
- ❌ Ingest KB cùng doc từ 2 worktree mà không mem_search trước

## 7. Tham chiếu

- `documents/SA4E-356/UG.md` §3.4 — Path Rules multi-worktree (facts verified: UT-05, UT-08, BR-06b, BR-07, FR-05)
- `documents/SA4E-356/TDD.md` §5 — file-by-file changes (dùng check R7 xung đột module)
- sm-core: STATUS.json / RUN-LOG.md conventions; jira-rules: transitions
