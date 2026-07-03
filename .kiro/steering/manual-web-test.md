---
inclusion: manual
---

# Manual Web Test — Quy trình bắt buộc

## Khi nào áp dụng

Khi user yêu cầu "test manual", "QA test", "test web", "test UI", hoặc bất kỳ yêu cầu nào liên quan đến kiểm tra giao diện web trên browser.

## Quy trình bắt buộc

### Bước 1: DevOps — Build & Start Server

Agent PHẢI thực hiện đầy đủ các bước sau (không skip, không hỏi user làm thay):

1. **Detect build system** — đọc project root để xác định build tool:
   - `package.json` → `npm run build` (hoặc script build trong scripts section)
   - `build.gradle.kts` / `build.gradle` → `gradlew build` hoặc task tạo artifact
   - `pom.xml` → `mvn package -DskipTests`
   - `pyproject.toml` / `setup.py` → build theo hướng dẫn trong README
   - `Makefile` → `make build`
   - Nếu không rõ → đọc README, tìm section "Build" hoặc "Getting Started"

2. **Chạy build** — dùng `execute_pwsh` để chạy build command đã detect:
   - PHẢI verify build thành công (exit code 0, không error)
   - Nếu build fail → fix lỗi rồi build lại

3. **Deploy artifacts** (nếu cần) — copy output vào vị trí chạy:
   - Jar → copy vào thư mục deploy
   - dist/ hoặc build/ → serve bằng static server
   - Nếu project chạy trực tiếp từ source (Node.js, Python) → skip bước này

4. **Detect start command** — xác định cách start server:
   - `package.json` scripts → `npm start` hoặc `npm run dev`
   - Jar file → `java -jar <path-to-jar>`
   - Python → `python main.py` hoặc `uvicorn app:app`
   - Nếu không rõ → đọc README section "Run" hoặc "Usage"

5. **Kill process cũ** (nếu có) — stop server đang chạy trước đó

6. **Start server mới** — dùng `control_pwsh_process` (action: start):
   - PHẢI dùng background process vì server là long-running
   - Đọc output để verify server đã ready (listen on port, "started" message)
   - Nếu server không start trong 30s → check logs, fix, retry

7. **Verify server accessible** — thử navigate tới URL gốc bằng browser tool:
   - Confirm page load thành công (không connection refused)
   - Ghi nhận base URL và port cho QA dùng ở Bước 2

### Bước 2: QA — Test tất cả màn hình

Dùng browser DevTools MCP tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`) để:

1. **Mở từng page** và verify:
   - Page load không lỗi (không 404, không blank)
   - Nav-bar hiện đúng (có links, có logout)
   - Content render đúng (không "Loading..." stuck, không JSON error)

2. **Test flows chính:**
   - Login → Profile → Logout → redirect đúng
   - Navigate qua tất cả nav links
   - Create/Edit/Delete operations (nếu có)
   - Error states (invalid input, unauthorized)

3. **Discover & test tất cả pages:**
   - Đọc source code (routes, controllers, static HTML files) để liệt kê tất cả endpoints
   - Hoặc dùng nav-bar/sidebar links từ trang chủ để discover pages
   - Test TỪNG page đã discover — không skip page nào
   - Ghi nhận kết quả vào checklist format:
     - [ ] `/<path>` — mô tả ngắn — status

### Bước 3: Dev — Fix lỗi

Nếu QA phát hiện lỗi:
1. Dev fix ngay (không cần hỏi user)
2. DevOps rebuild + restart
3. QA test lại

### Bước 4: Lặp lại cho đến khi PASS

Loop: Fix → Build → Deploy → Test → cho đến khi **tất cả pages PASS**.

### Bước 5: Báo cáo cho user

Chỉ báo user khi **tất cả tests đã PASS**. Format:

```
## ✅ Manual Web Test — PASSED

| Page | Status | Notes |
|------|--------|-------|
| /login | ✅ | ... |
| /profile | ✅ | ... |
| ... | ... | ... |

Server running at: localhost:{port}
```

## ⛔ KHÔNG BAO GIỜ

- Báo user "restart server để test" — DevOps phải tự restart
- Báo user từng lỗi một — phải tự fix hết rồi mới báo
- Skip test page nào — phải test TẤT CẢ
- Để lỗi "Loading..." hoặc JSON parse error — phải debug console

## Tools cần dùng

- `mcp_lowcode_devtools_local_navigate_page` — mở page
- `mcp_lowcode_devtools_local_take_snapshot` — đọc DOM
- `mcp_lowcode_devtools_local_take_screenshot` — chụp màn hình
- `mcp_lowcode_devtools_local_list_console_messages` — check JS errors
- `mcp_lowcode_devtools_local_click` — click elements
- `mcp_lowcode_devtools_local_fill` — fill forms
- `control_pwsh_process` — start/stop server process
- `execute_pwsh` — build, copy jar
