# Yêu cầu: Hiển thị lỗi chi tiết trong tooltip của Index Status (status bar)

## Bối cảnh & Vấn đề

Khi index workspace thất bại, status bar hiển thị `Indexing: 0%` hoặc `KB: 1 failed`,
nhưng **tooltip không chứa lỗi thật** → không thể chẩn đoán mà không đào log Pino ở
backend process (chạy độc lập, multi-tenant, port 48721 — extension chỉ là HTTP client,
KHÔNG spawn backend nên log backend không xuất hiện trong bất kỳ VS Code OutputChannel nào).

Mục tiêu: **tooltip của index status bar phải hiển thị nguyên nhân lỗi chi tiết**
(error message + phase + file đang xử lý nếu có), để chẩn đoán ngay trong IDE.

## Kiến trúc hiện tại (đã xác minh)

- Backend độc lập, log bằng Pino (`logger.error`). Ví dụ điểm lỗi:
  `[index-source] Background index failed`, `[indexer] ...`, `[graph-migrator] ...`.
  Các log này KHÔNG tới được extension.
- Extension poll trạng thái qua `GET /api/index/progress`.
- Có (ít nhất) 2 status bar item liên quan:
  1. `extension/src/services/IndexerHttpClient.ts` → `pollIndexProgress()` — item
     hiển thị `Indexing: N%` / `Index failed` / `Index complete`. Tooltip cho case
     `failed` hiện `progress.message || 'unknown error'`.
  2. Item hiển thị `KB: 1 failed` — CHƯA xác định được vị trí tạo. Cần AI tìm
     (grep `KB:` trong `extension/src`, có thể trong tree-view/status khác) và bổ sung
     tooltip lỗi tương tự.

## Root cause của "tooltip vô dụng"

1. Backend `GET /api/index/progress` (handler: `backend/src/server/routes/api-index-decoupled.ts`
   → `handleProgress`, và nguồn dữ liệu progress trong `backend/src/engine/indexer/`)
   **không đính error message chi tiết** vào payload khi index fail. Extension chỉ nhận
   được `status: 'failed'` mà không có `message` cụ thể → tooltip = "unknown error".
2. Đường upload→index (`backend/src/server/routes/api-index.ts` → `handleIndexSource`)
   chạy `runFullIndex` **fire-and-forget** và chỉ `logger.error` khi catch — lỗi này
   KHÔNG được ghi vào state progress mà endpoint `/api/index/progress` trả về.

## Yêu cầu triển khai

### Backend

1. Khi `runFullIndex` (hoặc bất kỳ bước index nào) throw, LƯU error vào progress state
   sao cho `GET /api/index/progress` trả về:
   ```json
   {
     "status": "failed",
     "phase": "indexing",
     "percentage": 0,
     "current": 0,
     "total": 0,
     "error": {
       "message": "<Error.message thật>",
       "stack": "<optional, rút gọn 3-5 dòng đầu>",
       "phase": "<scanning|indexing|resolving|graph-sync|...>",
       "file": "<relativePath nếu lỗi ở 1 file cụ thể>"
     },
     "lastUpdated": "<ISO>"
   }
   ```
2. Sửa `handleIndexSource` (fire-and-forget block): trong `.catch`, ngoài `logger.error`,
   PHẢI ghi error vào cùng progress state mà `/api/index/progress` đọc — kèm `projectId`,
   `phase`, `message`. Không được nuốt lỗi (tuân thủ rule: API không fail silently).
3. Nếu có nhiều job KB (cái gây "KB: 1 failed"), mỗi job fail PHẢI expose
   `{ jobName, error }` qua một endpoint trạng thái (tái dùng `/api/index/progress`
   hoặc endpoint KB status tương ứng).
4. LƯU Ý (không sửa trong ticket này nhưng cần biết để error message có ý nghĩa):
   nghi vấn root cause của "0%" là RACE — client upload theo nhiều batch, MỖI batch gọi
   `runFullIndex`, nhưng per-project guard `if (this.indexing.has(projectId)) return;`
   khiến batch đầu index khi Temp gần rỗng, các batch sau bị skip. Error surfacing sẽ
   giúp xác nhận. (Xem `backend/src/engine/indexer/indexing-engine.ts` runFullIndex guard.)

### Extension

5. `IndexerHttpClient.pollIndexProgress()` (`extension/src/services/IndexerHttpClient.ts`):
   - Case `status === 'failed'` / `phase === 'error'`: build tooltip đa dòng từ
     `progress.error`:
     ```
     Code Intelligence: Indexing FAILED
     Phase: {error.phase}
     Error: {error.message}
     {error.file ? 'File: ' + error.file : ''}
     {error.stack ? '\n' + error.stack : ''}
     ```
     Fallback về `progress.message` rồi 'unknown error' nếu `error` không có.
   - KHÔNG auto-dispose status bar item lỗi sau 8s (giữ lại để user đọc tooltip), hoặc
     tăng lên ≥30s. Hiện tại dispose sau 8s làm mất thông tin.
   - Dùng `vscode.MarkdownString` cho tooltip để xuống dòng/format đẹp (set `.supportHtml`
     hoặc dùng markdown code block cho stack).
6. Tìm và sửa item `KB: 1 failed` (grep `KB:` trong `extension/src`, loại `__tests__`):
   thêm tooltip hiển thị error chi tiết của job KB thất bại, cùng pattern như trên.
7. Thêm `command` cho các status bar item lỗi → mở OutputChannel liên quan hoặc chạy
   command hiển thị full error, để user click xem chi tiết (bổ trợ tooltip).

## Kiểm thử (bắt buộc)

- Unit test cho `pollIndexProgress`: given payload `{status:'failed', error:{message, phase, file}}`
  → assert `statusBar.tooltip` chứa message/phase/file (dùng mock trong
  `extension/src/test/mocks/vscode.ts`, đã có `__statusBarItems`).
- Backend test: khi `runFullIndex` throw, `GET /api/index/progress` trả `status:'failed'`
  kèm `error.message` khớp lỗi thật (không phải chuỗi rỗng/undefined).
- Regression: index thành công vẫn cho `status:'idle'` và tooltip "finished successfully".

## Ràng buộc

- File ≤ 200 dòng, hàm ≤ 20 dòng (code-standards). Tách helper build-tooltip nếu cần.
- KHÔNG nuốt exception; luôn surface cho user (rule exception-handling).
- Tuân thủ PG transaction rule khi chạm DB (không try/catch nuốt lỗi trong transaction).
- Tooltip/label dùng tiếng Anh (đồng nhất với log hiện tại).

## Tiêu chí hoàn thành (DoD)

- [ ] Khi index fail, hover icon status bar → thấy error message THẬT (không "unknown error").
- [ ] Tooltip hiển thị phase + file (nếu có) + stack rút gọn.
- [ ] `KB: 1 failed` item cũng có tooltip error chi tiết.
- [ ] `/api/index/progress` trả field `error` có cấu trúc khi fail.
- [ ] Có unit test cho cả backend (progress payload) và extension (tooltip render).
- [ ] Index thành công không bị regression.


---

# BỔ SUNG: Lỗi "KB: N failed" click không mở cửa sổ thông tin

## Phân biệt quan trọng (đã trace code)

`KB: N failed` KHÔNG phải lỗi index. Nó là trạng thái **ENRICHMENT** (LLM summarize
code symbols), tách biệt với luồng đưa code vào DB. Hai thứ khác nhau:
- `Indexing: 0%` (item từ `IndexerHttpClient.pollIndexProgress`) → liên quan index code vào DB.
- `KB: N failed` (item từ `EnrichmentStatusService`) → 1+ enrichment task LLM thất bại.

## Vị trí code (đã xác minh)

- Item tạo tại: `extension/src/services/EnrichmentStatusService.ts`
  - `updateStatusBar()` case `'error'` (dòng ~178): set text `$(warning) KB: N failed`,
    tooltip = MarkdownString (đã có recentFailures), `command = 'sa4e.showEnrichmentFailures'`.
- Command handler: `extension/src/extension.ts` dòng ~309 `registerCommand('sa4e.showEnrichmentFailures', ...)`.
- Nguồn dữ liệu: `IndexerHttpClient.getEnrichmentStatus()` → `GET /api/v1/enrichment/status`.
- `pollNow()` → `executePoll()`: trả `null` khi (a) response non-200, (b) Zod
  `EnrichmentStatusResponseSchema.safeParse` fail, hoặc (c) exception (timeout/network).

## ROOT CAUSE của "click không thấy cửa sổ"

Handler `sa4e.showEnrichmentFailures` (extension.ts:309) gọi `await enrichmentService.pollNow()`
NGAY ĐẦU, và:
```ts
const status = await enrichmentService.pollNow();
if (!status) {
  vscode.window.showErrorMessage('Cannot reach backend for enrichment status.');
  return;   // ← THOÁT SỚM: OutputChannel KHÔNG BAO GIỜ mở
}
const output = vscode.window.createOutputChannel('Kiro Enrichment Failures');
... output.show(true);
```
→ Khi click, `pollNow()` thực hiện một poll MỚI. Nếu poll đó fail (backend chậm/lỗi/timeout
5s, hoặc endpoint enrichment trả lỗi), handler return sớm → user không thấy cửa sổ nào,
chỉ có (nếu may) một toast đỏ thoáng qua. Nghịch lý: status bar đang ở state `error` nghĩa
là poll TRƯỚC ĐÓ đã có data failures — nhưng data đó bị vứt đi, không cache, nên click lại
phụ thuộc hoàn toàn vào một poll mới có thể fail.

Ngoài ra `createOutputChannel('Kiro Enrichment Failures')` được gọi MỖI lần click → tạo
channel trùng lặp (leak) thay vì tái sử dụng.

## Yêu cầu fix (Extension)

1. **Cache lần poll thành công gần nhất** trong `EnrichmentStatusService` (thêm field
   `private lastStatus: EnrichmentStatusResponse | null`). Cập nhật trong `processResponse()`.
   Thêm getter `getLastStatus()`.
2. **Sửa handler `sa4e.showEnrichmentFailures`** (extension.ts:309) để LUÔN mở OutputChannel,
   kể cả khi `pollNow()` fail:
   - Gọi `pollNow()`; nếu trả data → dùng data mới.
   - Nếu `null` → fallback về `enrichmentService.getLastStatus()` (data cache).
   - Nếu vẫn không có → vẫn mở OutputChannel và in rõ: "Không lấy được enrichment status
     mới (backend non-200/timeout). Lý do poll gần nhất: <reason>. Endpoint:
     GET /api/v1/enrichment/status." + gợi ý kiểm tra backend.
   - LUÔN `output.show(true)` để user thấy cửa sổ (đây là điểm mấu chốt user phàn nàn).
3. **Tái sử dụng một OutputChannel duy nhất** (tạo 1 lần, lưu tham chiếu; hoặc dùng chung
   channel với `EnrichmentStatusService.outputChannel` vốn đã ghi log `[Enrichment]`/`[EnrichmentPoll]`).
   KHÔNG `createOutputChannel` mỗi lần click.
4. In vào OutputChannel: state, total/completed/failed, và `recentFailures` (mỗi failure:
   symbolName/taskId + error đầy đủ, không cắt 200 ký tự khi ở Output). Nếu có cache mà không
   có poll mới, ghi rõ "(dữ liệu từ lần poll gần nhất lúc <timestamp>)".
5. **Phơi bày lý do poll fail:** `executePoll()`/`handlePollFailure()` hiện chỉ `this.log(...)`.
   Lưu `private lastPollError: string | null` để handler command in được lý do cụ thể
   (non-200 + body snippet, Zod error, hay exception message).

## Yêu cầu fix (Backend — nếu enrichment status thực sự fail)

6. Kiểm tra `GET /api/v1/enrichment/status`
   (handler quanh `backend/src/server/routes/` + service enrichment
   `backend/src/**/enrichment*`): đảm bảo khi có task fail, response trả
   `state:'error'` + `recentFailures[]` với `{ taskId, symbolName, error }` đầy đủ.
   Nếu endpoint đang trả non-200 hoặc payload sai schema (khiến Zod parse fail phía client
   → `pollNow()` null → không mở cửa sổ), sửa để trả 200 + payload đúng
   `EnrichmentStatusResponseSchema` (xem `extension/src/services/enrichment-status-schema.ts`).

## Kiểm thử

- Extension unit test (mock `pollNow` trả null + `getLastStatus` có data):
  assert OutputChannel ĐƯỢC mở (`show` được gọi) và chứa nội dung failures/ lý do.
- Extension test (mock cả hai null): assert OutputChannel vẫn mở + in message hướng dẫn.
- Assert KHÔNG tạo OutputChannel mới ở lần click thứ 2 (tái sử dụng).
- Backend test: khi có failed task, `/api/v1/enrichment/status` trả 200 + schema hợp lệ +
  `recentFailures` không rỗng.

## DoD

- [ ] Click "KB: N failed" LUÔN mở cửa sổ Output (kể cả khi poll mới fail).
- [ ] Cửa sổ hiển thị danh sách failures + error đầy đủ, hoặc lý do không lấy được + endpoint.
- [ ] Không leak OutputChannel (tái sử dụng 1 instance).
- [ ] Lý do poll fail (non-200/zod/exception) được surface cho user.
- [ ] Có unit test cho các nhánh trên.


---

# BỔ SUNG 2: Salesforce index kẹt 0% + click index icon không mở cửa sổ

## Triệu chứng (từ screenshot)
- Output "SDLC Indexing": `Indexed 666 project files` (upload OK) nhưng status bar `Indexing: 0%`.
- Bên trái: **"Backend KB unreachable after 3 attempts: fetch failed"**; Chat panel = **disconnected**.
- Click index status icon → KHÔNG có cửa sổ nào mở.
- MCP Wrapper Server port thay đổi giữa các lần (9170/9181) — dấu hiệu backend restart/không ổn định.

## Root cause (đã trace, 3 lỗi UI + 1 nguyên nhân gốc)

### Nguyên nhân gốc
Backend **không reachable** khi index Salesforce. Bằng chứng: `KbUnreachableError`
tại `extension/src/knowledge-client.ts:283` ("Backend KB unreachable after N attempts"),
Chat disconnected. (Cần điều tra riêng vì sao backend down khi index SF — có thể crash/treo;
xem phần "Điều tra backend" bên dưới.)

### Lỗi UI 1 — Index status bar item KHÔNG có `command` (đây là lý do trực tiếp "click không ra gì")
`extension/src/services/IndexerHttpClient.ts` → `pollIndexProgress()` tạo status bar item
(dòng ~60) nhưng **không bao giờ set `statusBar.command`**. Do đó click vào icon
`Indexing: N%` / `Indexing...` KHÔNG làm gì.
→ FIX: set `statusBar.command` trỏ tới một command mở OutputChannel chi tiết (ví dụ tái dùng
"Kiro Indexer" channel hoặc tạo command `kiroSdlc.showIndexStatus`).

### Lỗi UI 2 — `triggerFullIndex` nuốt lỗi hoàn toàn
`IndexerHttpClient.triggerFullIndex()` (dòng ~326) bọc toàn bộ trong `try { ... } catch { /* non-fatal */ }`.
Khi `POST /api/index/full` fail vì backend down, lỗi bị nuốt, không log, không báo user.
→ FIX: log lỗi vào OutputChannel "Kiro Indexer" + nếu fail vì unreachable, set status bar item
sang trạng thái error có tooltip "Backend unreachable — index not started" + command mở Output.

### Lỗi UI 3 — `pollIndexProgress` fire-and-forget nuốt lỗi + không phân biệt "backend down"
Tại `uploadSourceFiles` (dòng ~319): `this.pollIndexProgress(token).catch(() => {})`.
Trong `pollIndexProgress`, khi fetch `/api/index/progress` trả non-200/timeout (backend down),
code vào nhánh `if (!ok) { statusBar.text = "$(sync~spin) Indexing..."; ... continue; }` →
KẸT hiển thị spinner suốt tới `maxWaitMs` (5 phút) rồi mới "Index timeout". User thấy như
"đang index 0%" mãi mà thực ra backend không phản hồi.
→ FIX:
  - Đếm số lần fetch progress fail liên tiếp; sau N lần (vd 3) → chuyển status bar sang
    `$(error) Index: backend unreachable`, tooltip nêu URL + lý do, set `command` mở Output,
    và DỪNG poll (không chờ hết 5 phút).
  - KHÔNG nuốt lỗi bằng `.catch(()=>{})` trống — ít nhất log vào OutputChannel.

### Lỗi luồng (cần xác nhận) — chỉ index khi `uploaded > 0`
`uploadSourceFiles` chỉ gọi `triggerFullIndex`+`pollIndexProgress` khi `uploaded > 0`.
Nếu tất cả batch upload fail (backend down) → `uploaded = 0` → KHÔNG trigger index, KHÔNG poll,
KHÔNG báo lỗi rõ ràng. Screenshot cho thấy uploaded=666 nên nhánh này không phải case hiện tại,
nhưng vẫn nên: khi `uploaded == 0` và có `errors > 0`, hiện status bar/notification lỗi rõ ràng.

## Yêu cầu fix (Extension)

1. `pollIndexProgress` status bar item PHẢI có `command` mở cửa sổ chi tiết (OutputChannel
   "Kiro Indexer" hoặc command riêng). Đây là fix trực tiếp cho "click không ra cửa sổ".
2. Phân biệt "backend unreachable" với "đang index": sau ≥3 lần fetch `/api/index/progress`
   fail liên tiếp → dừng poll, status bar `$(error) Index: backend unreachable`, tooltip nêu
   `${backendUrl}/api/index/progress` + lý do fetch fail, `command` mở Output.
3. `triggerFullIndex`: KHÔNG nuốt lỗi — log vào OutputChannel; nếu unreachable, surface cho user.
4. Bỏ `.catch(() => {})` trống ở lời gọi `pollIndexProgress`; thay bằng log.
5. Khi `uploaded === 0 && errors > 0`: hiện notification + status bar lỗi (upload thất bại,
   backend có thể down), kèm gợi ý xem "Kiro Indexer" Output.
6. (Tùy chọn) Thêm health-check nhanh tới backend trước khi index; nếu down → báo ngay,
   không bắt user chờ.

## Điều tra Backend (nguyên nhân gốc — tách riêng)

Cần xác định vì sao backend unreachable khi index Salesforce:
- Backend có crash/treo trong lúc index 666 file SF không? (OOM, exception chưa bắt, PG pool
  exhaustion — lưu ý rule PG: transaction abort khi 1 query fail).
- Kiểm tra log Pino backend quanh `POST /api/index/source` và `/api/index/full` khi index SF.
- Nghi vấn cũ vẫn mở: race batch + per-project guard trong `runFullIndex`
  (`backend/src/engine/indexer/indexing-engine.ts`).
→ Sau khi Lỗi UI 1-3 được fix, tooltip/Output sẽ phơi bày lỗi backend thật để chốt root cause.

## Kiểm thử
- Unit test `pollIndexProgress`: sau 3 lần fetch fail → status bar text chứa "unreachable",
  `command` khác undefined, và poll dừng (không lặp tới maxWaitMs). Dùng mock
  `extension/src/test/mocks/vscode.ts` (`__statusBarItems`) + mock fetch fail.
- Unit test: click command của index status item → OutputChannel `show` được gọi.
- Unit test `triggerFullIndex` khi POST fail → có log/không nuốt im lặng.

## DoD
- [ ] Click index status icon LUÔN mở cửa sổ Output chi tiết.
- [ ] Khi backend down, status bar hiện "backend unreachable" (không kẹt spinner 5 phút).
- [ ] `triggerFullIndex` không nuốt lỗi.
- [ ] Có unit test cho command + trạng thái unreachable.
- [ ] (Backend) xác định & xử lý nguyên nhân backend down khi index Salesforce.


---

# ROOT CAUSE XÁC ĐỊNH: Index 0/0 files — Path mismatch (single source of truth bị vi phạm)

## Bằng chứng
Tooltip index status: `Code Intelligence — complete (completed) / Progress: 0/0 files (0%)
/ Elapsed 58s / Checksum: skipped 0, processed 0, pending 0`.
→ Index "hoàn thành" nhưng quét 0 file. Output channel trống vì KHÔNG có lỗi — index
thực sự complete trên một thư mục RỖNG/SAI. Không phải backend down, không phải parser.

## Nguyên nhân (đã trace, chắc chắn)
Hai endpoint dùng HAI thư mục temp KHÁC NHAU cho cùng một "workspace":

| Bước | Endpoint / hàm | Path |
|------|----------------|------|
| Upload 666 file | `POST /api/index/source` → `handleIndexSource` (`backend/src/server/routes/api-index.ts`) | `C:\projects\kiro\Temp\{userId}\{projectId}\source` (HARDCODE) |
| Trigger index | `POST /api/index/full` → `handleFullIndex` → `resolveScope` (`backend/src/server/routes/api-index-decoupled.ts`) | `path.join(config.indexTempDir, userId, projectId)` |
| Poll progress | `GET /api/index/progress` → `resolveScope` | cùng path với `/full` |

`config.indexTempDir` (`backend/src/config/index.ts:157`) =
`process.env.CODE_INTEL_INDEX_TEMP_DIR || path.join(os.tmpdir(), 'CodeIntel')`
→ ví dụ `C:\Users\<user>\AppData\Local\Temp\CodeIntel\{userId}\{projectId}`.

→ Client upload file vào `C:\projects\kiro\Temp\...\source`, nhưng `/api/index/full`
quét `...\AppData\Local\Temp\CodeIntel\...` (rỗng) → 0/0 files → complete.
Progress mà client poll gắn với `/api/index/full` (path rỗng) nên luôn 0%.

## Thêm: hai cơ chế index chồng chéo
`handleIndexSource` (fix trước) tự gọi `runFullIndex({ workspace: tempBase })` với
`tempBase = C:\projects\kiro\Temp\...\source` (ĐÚNG path có file). NHƯNG client
(`IndexerHttpClient.uploadSourceFiles`) CÒN gọi thêm `triggerFullIndex → POST /api/index/full`
(SAI path, rỗng). Hai luồng index song song, khác path, và progress hiển thị lấy từ luồng sai.

## Yêu cầu fix (Backend — chọn 1 hướng, thống nhất single source of truth)

**Hướng A (khuyến nghị): thống nhất về `indexTempDir` chuẩn.**
- Sửa `handleIndexSource` (api-index.ts) GHI file vào ĐÚNG thư mục mà
  `api-index-decoupled.resolveScope` dùng: `path.join(config.indexTempDir, userId, projectId)`
  (bỏ hardcode `C:\projects\kiro\Temp` và bỏ hậu tố `\source`, hoặc thống nhất cả hai bên
  cùng dùng 1 helper `resolveScope`).
- Sau khi upload xong tất cả batch, client chỉ gọi `POST /api/index/full` MỘT lần;
  bỏ `runFullIndex` fire-and-forget lồng trong `handleIndexSource` để tránh 2 luồng chồng chéo.
- Kết quả: `/full` quét đúng thư mục vừa upload → progress phản ánh số file thật.

**Hướng B: dùng thẳng `runFullIndex` trên path upload, bỏ `/api/index/full`.**
- Nếu giữ `handleIndexSource` tự index `tempBase`, thì progress phải gắn với luồng đó,
  và client KHÔNG gọi `/api/index/full` nữa. Nhưng `/api/index/progress` hiện đọc theo
  `resolveScope` (indexTempDir) → vẫn mismatch. Phải cho progress đọc đúng operation của
  luồng upload. Phức tạp hơn A.

**Bắt buộc kèm theo:**
- Tạo MỘT helper `resolveIndexScope(c)` dùng CHUNG cho `api-index.ts` và
  `api-index-decoupled.ts` để không còn 2 định nghĩa path lệch nhau (đây là single source
  of truth — nguyên tắc no-workaround).
- Loại bỏ hardcode `C:\projects\kiro\Temp` (không portable, khác máy/CI sẽ sai).

## Kiểm thử
- Backend test: upload N file qua `/api/index/source` rồi `/api/index/full` →
  `/api/index/progress` báo `total === N` (không phải 0), `status` complete với N > 0.
- Assert path upload == path scan (cùng helper `resolveIndexScope`).
- Regression: index Salesforce 666 file → progress > 0, symbols/graph nodes được tạo.

## DoD
- [ ] `/api/index/source` và `/api/index/full` dùng CÙNG thư mục (qua helper chung).
- [ ] Không còn hardcode `C:\projects\kiro\Temp`.
- [ ] Không còn 2 luồng index chồng chéo cho một lần upload.
- [ ] Index Salesforce báo đúng số file (> 0), tạo được symbols/graph nodes.
- [ ] Có backend test cho path consistency (upload path == scan path).


---

# ĐÍNH CHÍNH: nguồn thư mục temp là CONFIG backend, không phải os.tmpdir cố định

Làm rõ (tránh hiểu nhầm): `{os.tmpdir()}\CodeIntel` CHỈ là fallback mặc định.
Nguồn thật của thư mục index là **cấu hình backend server**:

```ts
// backend/src/config/index.ts:157
indexTempDir: process.env.CODE_INTEL_INDEX_TEMP_DIR || path.join(os.tmpdir(), 'CodeIntel'),
```
Thứ tự ưu tiên: `CODE_INTEL_INDEX_TEMP_DIR` (env/config backend) → fallback `os.tmpdir()/CodeIntel`.

**Đúng/sai giữa hai endpoint:**
- `api-index-decoupled.ts` (`/api/index/full`, `/api/index/progress`) → ĐÚNG:
  dùng `config.indexTempDir` (tôn trọng cấu hình backend). Đây là single source of truth.
- `api-index.ts` (`handleIndexSource`, upload) → SAI: **hardcode `C:\projects\kiro\Temp`**,
  bỏ qua hoàn toàn `config.indexTempDir`.

**Do đó fix chuẩn:** `handleIndexSource` PHẢI đọc `config = loadConfig()` và dùng
`path.join(config.indexTempDir, userId, projectId)` (giống `api-index-decoupled.resolveScope`),
TUYỆT ĐỐI không hardcode path. Tốt nhất tách 1 helper `resolveIndexScope(c)` dùng chung cho
cả hai file để path luôn nhất quán và luôn lấy từ config backend.

Ràng buộc bổ sung cho DoD:
- [ ] Không còn bất kỳ hardcode path nào trong luồng index (`C:\projects\kiro\Temp`, v.v.).
- [ ] Thư mục temp LUÔN lấy từ `config.indexTempDir` (env `CODE_INTEL_INDEX_TEMP_DIR`).
- [ ] Cùng 1 helper resolve scope cho `/api/index/source` và `/api/index/full|progress`.


---

# ROOT CAUSE CHỐT: 0% dù code ĐÃ index (726 symbols) — progress theo dõi nhầm manager instance

## Bằng chứng mới (quyết định)
Status bar: **"Enriching: 717/726 (98%)"** song song với **"Indexing: 0%"**.
→ Có 726 symbol trong DB ⇒ code ĐÃ index thành công. "0%" chỉ là hiển thị sai.
Output "Kiro Indexer" trống ⇒ KHÔNG có lỗi (index thành công thật).

## Nguyên nhân (đã trace `IndexOperationManager`)

Progress cập nhật hoàn toàn qua `engine.on('progress')`. Mỗi `IndexOperationManager` đăng ký
1 listener trong constructor và chỉ cập nhật op của CHÍNH instance đó (`onEngineProgress`
duyệt `this.operations`).

- `handleIndexSource` (`api-index.ts`) tạo **`new IndexOperationManager(idx)` TẠM** mỗi request
  (comment ghi "temporary instance") rồi `startOrReplace(...)`. Op running nằm trong instance TẠM này.
- `handleProgress` / `/api/index/full` (`api-index-decoupled.ts`) dùng manager **SINGLETON** từ
  `managerCache` (WeakMap) qua `getManager()`.

→ `/api/index/progress` đọc singleton → KHÔNG có op (op ở instance tạm) → cold-path DB →
nếu chưa có record active → trả `idle()` = **0%**. Engine vẫn index thật (726 symbols).

Hệ quả phụ: mỗi instance tạm đăng ký THÊM một `engine.on('progress')` → **leak listener**
tích lũy theo mỗi lần upload.

## Bug phụ đi kèm (path/key lệch)
- Upload/index scope: `{config.indexTempDir}/{userId||'local-dev'}/{projectId}/source`.
- Progress scope (`api-index-decoupled.resolveScope`): `{config.indexTempDir}/{userId||'default'}/{projectId}` (không `/source`).
- userId fallback khác (`'local-dev'` vs `'default'`) ⇒ composite key `${userId}:${projectId}`
  khác ⇒ ngay cả khi cùng manager cũng không khớp op.

## Yêu cầu fix (Backend — single source of truth)

1. **Dùng CÙNG một IndexOperationManager singleton** cho cả `handleIndexSource` và
   `handleProgress`/`handleFullIndex`.
   - Export `getManager(registry)` từ `api-index-decoupled.ts` (đang dùng `managerCache` WeakMap).
   - `handleIndexSource` PHẢI gọi `getManager(registry)` thay vì `new IndexOperationManager(idx)`.
   - XÓA việc tạo instance tạm (nguồn của leak listener + progress lạc).
2. **Thống nhất scope/userId/path** qua 1 helper chung `resolveIndexScope(c)`:
   - Cùng `config.indexTempDir`, cùng quy ước userId fallback, cùng quyết định có/không hậu tố
     `/source`. Upload ghi vào path X ⇒ index chạy trên path X ⇒ progress đọc op theo cùng
     `${userId}:${projectId}`.
3. **Bỏ luồng index chồng chéo:** chỉ MỘT nơi khởi động index cho một lần upload
   (khuyến nghị: client gọi `/api/index/full` một lần sau khi upload xong tất cả batch,
   `handleIndexSource` chỉ ghi file — hoặc ngược lại, nhưng KHÔNG cả hai).
4. (Dọn dẹp) Đảm bảo `engine.on('progress')` chỉ đăng ký 1 lần cho manager singleton
   (không đăng ký lại mỗi request).

## Kiểm thử
- Backend test: sau upload N file + trigger index, `/api/index/progress` phản ánh cùng
  operation (total tiến tới N, status running→completed), KHÔNG trả idle/0% khi op đang chạy.
- Test: `handleIndexSource` và `handleProgress` trả về op có CÙNG operationId (cùng manager).
- Test: nhiều lần upload liên tiếp KHÔNG làm tăng số listener trên engine (no leak).
- Regression: index Salesforce → progress khớp 726 symbols/đúng số file, enrichment vẫn chạy.

## DoD
- [ ] Chỉ 1 IndexOperationManager singleton dùng chung giữa 2 file route.
- [ ] `/api/index/progress` hiển thị đúng %/số file của luồng index đang chạy (không 0% giả).
- [ ] Không tạo `new IndexOperationManager` tạm trong `handleIndexSource`.
- [ ] Không leak `engine.on('progress')` listener.
- [ ] Upload path == index path == progress scope (cùng helper).
- [ ] Có test cho progress consistency + no listener leak.
