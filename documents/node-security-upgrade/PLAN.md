# Kế hoạch nâng cấp Node.js để vá CVE — SDLC-Agents-4-Enterprise

> **Mục tiêu:** Pin Node.js xuống một patch version an toàn (đã vá các CVE gần đây) trên toàn repo, thay vì để constraint lỏng `22.x` / `22`.
> **Tài liệu dành cho:** AI agent / DEV thực hiện tự động.
> **Ngày lập:** 2026-10-27

---

## 1. Bối cảnh & phát hiện

### 1.1 Node version đang khai báo (canonical — đang chạy thật)

| # | File | Khai báo hiện tại | Loại |
|---|------|-------------------|------|
| 1 | `package.json` (root) | `"engines": { "node": "22.x" }` | engines |
| 2 | `backend/package.json` | `"engines": { "node": "22.x" }` | engines |
| 3 | `.nvmrc` (root) | `22` | version pin |
| 4 | `backend/Dockerfile` | `ARG NODE_VERSION=22` + `ARG NODE_BASE_DIGEST=sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c` | base image |
| 5 | `.github/workflows/*.yml` (nhiều file) | `node-version: '22'` / `"22"` | CI |

> `extension/package.json` **không** pin Node (chỉ có `engines.vscode`) → không cần sửa.

### 1.2 Kết luận về "version nhỏ nhất"

- **Thực tế toàn repo = Node 22.x.** Không có cấu hình đang chạy nào < 22.
- Các mốc Node 18 / 20 chỉ nằm trong **tài liệu lịch sử** dưới `documents/` (SA4E-189, SA4E-225, SA4E-242, SA4E-125). Đây KHÔNG phải cấu hình đang hoạt động — xử lý ở mục dọn dẹp (tùy chọn).

### 1.3 Vấn đề bảo mật

- `engines.node: "22.x"` và `.nvmrc: 22` chỉ khóa **major**, không khóa **patch** → dev/CI có thể chạy bản 22.x cũ dính CVE.
- CVE gần đây trên nhánh 22.x:
  - **CVE-2026-111497** (High) — out-of-bounds write trong Brotli decoder → nguy cơ RCE ("Node2Shell"). [Node.js Oct 2026 advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
  - 2 lỗi High: TLS hostname verification bypass (cùng đợt Oct 2026).
  - **CVE-2026-56846** (High) — HTTP/2 retained headers vượt `maxSessionMemory`. [Node.js Jul 2026 advisory](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases)

### 1.4 Version mục tiêu

- **Node 22.23.4** (phát hành 2026-10-21) — bản vá đầy đủ 10 CVE gồm Brotli RCE trên nhánh 22.x (Active LTS). Nguồn: [patch guide](https://blog.ogwilliam.com/post/nodejs-brotli-rce-cve-2026-111497).
- **Không** nâng major lên 24.x trong phạm vi kế hoạch này (24.x cần kiểm thử lại native deps `onnxruntime-node` + rolldown binding — tách thành ticket riêng nếu muốn).

> ⚠️ **AI thực hiện: xác minh lại version mới nhất trước khi apply.** Trước khi commit, chạy kiểm tra để đảm bảo `22.23.4` vẫn là (hoặc chưa bị vượt bởi) bản patch an toàn mới nhất của nhánh 22.x. Nếu đã có bản 22.x cao hơn, dùng bản cao hơn và cập nhật lại toàn bộ con số trong kế hoạch này cho nhất quán.

**Hằng số dùng xuyên suốt kế hoạch:**
- `TARGET_NODE = 22.23.4`
- `TARGET_ENGINES_RANGE = ">=22.23.4 <23"`
- `TARGET_DOCKER_DIGEST = <digest của node:22.23.4-slim>` (phải lấy ở Task 4)

---

## 2. Thứ tự thực hiện (checklist tổng)

- [ ] Task 1 — Pin `engines.node` ở `package.json` (root)
- [ ] Task 2 — Pin `engines.node` ở `backend/package.json`
- [ ] Task 3 — Cập nhật `.nvmrc`
- [ ] Task 4 — Cập nhật `backend/Dockerfile` (tag + digest)
- [ ] Task 5 — Cập nhật tất cả CI workflow
- [ ] Task 6 — (Tùy chọn) Dọn docs lịch sử gây nhầm lẫn
- [ ] Task 7 — Verify toàn bộ
- [ ] Task 8 — Commit theo convention

---

## 3. Chi tiết từng Task

### Task 1 — `package.json` (root)

**File:** `package.json`

Đổi:
```json
  "engines": {
    "node": "22.x"
  },
```
Thành:
```json
  "engines": {
    "node": ">=22.23.4 <23"
  },
```

---

### Task 2 — `backend/package.json`

**File:** `backend/package.json`

Đổi:
```json
  "engines": {
    "node": "22.x"
  },
```
Thành:
```json
  "engines": {
    "node": ">=22.23.4 <23"
  },
```

---

### Task 3 — `.nvmrc`

**File:** `.nvmrc` (root)

Đổi nội dung từ:
```
22
```
Thành:
```
22.23.4
```

> Lưu ý: còn `.kilo/worktrees/pickled-hook/.nvmrc` — nếu worktree này còn active, cập nhật tương tự; nếu là artifact cũ thì bỏ qua (kiểm tra git status trước).

---

### Task 4 — `backend/Dockerfile`

**File:** `backend/Dockerfile`

#### 4a. Lấy digest mới (BẮT BUỘC — không được đoán)

Chạy một trong hai cách để lấy digest chính xác của `node:22.23.4-slim`:

```bash
# Cách 1: docker (nếu có daemon)
docker pull node:22.23.4-slim
docker inspect --format='{{index .RepoDigests 0}}' node:22.23.4-slim

# Cách 2: skopeo (không cần pull)
skopeo inspect docker://node:22.23.4-slim --format '{{.Digest}}'
```

Ghi lại digest `sha256:...` → đây là `TARGET_DOCKER_DIGEST`.

#### 4b. Sửa file

Đổi:
```dockerfile
ARG NODE_VERSION=22
# node:22-slim — pin by digest for a reproducible supply chain (SEC-02).
# Tag kept for readability; the digest is the authoritative pin.
ARG NODE_BASE_DIGEST=sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
```
Thành:
```dockerfile
ARG NODE_VERSION=22.23.4
# node:22.23.4-slim — pin by digest for a reproducible supply chain (SEC-02).
# Patched for CVE-2026-111497 (Brotli RCE) + TLS/HTTP2 highs. Tag kept for
# readability; the digest is the authoritative pin.
ARG NODE_BASE_DIGEST=<TARGET_DOCKER_DIGEST>
```

> Hai dòng `FROM node:${NODE_VERSION}-slim@${NODE_BASE_DIGEST}` (stage `base` và `production`) tự động dùng ARG mới — không cần sửa thêm.
> Cập nhật tham chiếu digest trong `documents/SA4E-335/SECURITY-ASSESSMENT.md` (SEC-02) nếu muốn giữ docs đồng bộ (tùy chọn).

---

### Task 5 — CI workflows

**Thư mục:** `.github/workflows/`

Tất cả các `actions/setup-node` đang dùng `node-version: '22'` hoặc `"22"`. Đổi thành `22.23.4`.

Danh sách file chứa `node-version: 22` (cần sửa — mỗi file có thể nhiều occurrence):

| File | Số chỗ (ước tính) |
|------|-------------------|
| `ci.yml` | 4 |
| `publish.yml` | 2 |
| `auto-release.yml` | 1 |
| `e2e-tests.yml` | 2 |
| `ci-sa4e-191.yml` | 1 |
| `ci-sa4e-223.yml` | 2 |
| `ci-sa4e-241.yml` | 6 |
| `ci-sa4e-332.yml` | 1 |
| `ci-sa4e-336.yml` | 2 |
| `ci-sa4e-356.yml` | 3 |
| `ci-sa4e-358.yml` | 2 |
| `ci-sa4e-369.yml` | 1 |

**Hành động:** với mỗi occurrence, thay `node-version: '22'` / `node-version: "22"` → `node-version: '22.23.4'` (giữ nguyên kiểu quote của từng file).

> Dùng grep để chắc chắn không bỏ sót:
> ```bash
> grep -rn "node-version" .github/workflows/
> ```
> Sau khi sửa, kết quả grep không được còn `node-version: '22'` hay `"22"` (chỉ còn `22.23.4` hoặc các biến matrix như `${{ matrix.node_version }}` trong `build-native.yml` / `build-onnxruntime.yml` — xem lưu ý dưới).

**Lưu ý đặc biệt:**
- `build-native.yml` và `build-onnxruntime.yml` dùng `node-version: ${{ matrix.node_version }}` (matrix). Kiểm tra phần `matrix` của 2 file này: nếu có liệt kê `22` thì đổi thành `22.23.4`; đây là build native binary nên cân nhắc giữ dải major nếu cần build đa phiên bản — đọc kỹ matrix trước khi sửa.
- `build-push-backend.yml` và `scheduled-prebuild-scan.yml`: kiểm tra xem có hardcode Node version không (grep không thấy `node-version` nhưng nên mở xác nhận).

---

### Task 6 — (TÙY CHỌN) Dọn docs lịch sử

Các file docs này tham chiếu Node 18/20 và gây nhầm lẫn về "version nhỏ nhất":

- `documents/SA4E-189/DOCKERFILE` → `node:18-alpine`
- `documents/SA4E-189/DEPLOYMENT_GUIDE.md` → `node-version: '18'`
- `documents/SA4E-242/ci-cd-extension.yml` → `node-version: '18'`
- `documents/SA4E-225/DPG.md` → `node-version: '18.14.1'`
- `documents/SA4E-125/DPG.md` → `node-version: 20`

**Khuyến nghị:** KHÔNG sửa nội dung docs lịch sử (chúng phản ánh trạng thái tại thời điểm ticket). Thay vào đó, nếu cần tránh nhầm lẫn, thêm 1 dòng chú thích đầu file hoặc bỏ qua. Quyết định cuối cùng để người review chọn — đây là task không bắt buộc.

---

### Task 7 — Verify

1. **Grep xác nhận không còn pin lỏng:**
   ```bash
   grep -rn "\"node\": \"22.x\"" package.json backend/package.json   # phải rỗng
   grep -rn "node-version: '22'\|node-version: \"22\"" .github/workflows/   # phải rỗng
   cat .nvmrc   # => 22.23.4
   ```
2. **Dockerfile:** digest đã đổi, `ARG NODE_VERSION=22.23.4`.
3. **Cài lại & build (nếu môi trường cho phép):**
   ```bash
   # root workspace
   npm ci
   npm run build        # nếu có
   # backend
   npm ci --prefix backend
   npm run build --prefix backend
   ```
   > Nếu máy đang chạy Node < 22.23.4, `npm ci` sẽ cảnh báo/EBADENGINE. Cập nhật runtime local (`nvm install 22.23.4 && nvm use`) trước khi verify.
4. **Docker build thử (nếu có daemon):**
   ```bash
   docker build --target production -t sa4e-backend:node-upgrade ./backend
   ```
   Phải build thành công — xác nhận native deps (`onnxruntime-node`) vẫn link glibc OK.
5. **(Nếu có) chạy Trivy scan** như `build-push-backend.yml` để xác nhận không còn CVE Critical/High từ Node base.

---

### Task 8 — Commit

- Tạo branch: `node-security-upgrade` (hoặc theo ticket key nếu có).
- KHÔNG push thẳng vào `main`/`master`.
- Stage từng file cụ thể (không `git add -A`):
  ```bash
  git add package.json backend/package.json .nvmrc backend/Dockerfile .github/workflows/
  git commit -m "chore(security): pin Node to 22.23.4 to patch CVE-2026-111497 and related highs"
  ```
- Mở PR với mô tả: lý do (CVE), phạm vi file, kết quả verify (build + scan).

---

## 4. Rủi ro & lưu ý

| Rủi ro | Mức | Giảm thiểu |
|--------|-----|------------|
| Digest sai ở Dockerfile | Cao | Bắt buộc lấy digest thật qua `docker`/`skopeo` (Task 4a), không copy từ kế hoạch |
| Native deps không tương thích patch mới | Thấp | Patch cùng major 22.x → ABI ổn định; verify bằng docker build + onnxruntime load |
| Bỏ sót occurrence trong CI | Trung bình | Grep xác nhận ở Task 7 |
| `22.23.4` đã lỗi thời khi thực thi | Trung bình | Xác minh lại bản 22.x mới nhất trước khi apply (mục 1.4) |
| Local dev chưa cài 22.23.4 | Thấp | `nvm install 22.23.4` trước verify |

## 5. Phạm vi KHÔNG làm

- Không nâng major lên Node 24.x (tách ticket riêng, cần regression test native modules).
- Không sửa `extension/package.json` (không pin Node).
- Không viết lại nội dung docs lịch sử trong `documents/` (chỉ tùy chọn chú thích).
