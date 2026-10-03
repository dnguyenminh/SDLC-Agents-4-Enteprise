# Fix: `resumableDownload` HTTP 400 — migrate sang POST + query params

> **Trạng thái:** ✅ ĐÃ FIX & verify (test 8/8 pass).
> **Nguyên tắc:** Fix root cause (xem `.kiro/steering/no-workaround-rule`), không workaround.

---

## 1. Bối cảnh & triệu chứng

Khi index Pega project, log hiện:

```
[Catalog] 📦 Result file: /ColdeIntelligence/RuleList/rulecatalog_8f4f0773-...zip
[Pega Indexer] ⚠️ Catalog export failed (Resumable download failed: HTTP 400) — falling back to BFS crawl.
```

Chuỗi `Resumable download failed: HTTP {status}` được throw tại `PegaCatalogDownloader.fetchAllChunks` khi status không phải 206/200.

## 2. Root cause

Code gọi endpoint theo contract **cũ** (GET + path segment + Range header), không khớp contract **mới** mà server yêu cầu (POST + query params). Server từ chối với **HTTP 400**.

| Yếu tố | Code cũ (lỗi 400) | API mới (đã áp dụng) |
|--------|-------------------|----------------------|
| HTTP method | `GET` | `POST` |
| Vị trí file | path segment `/resumableDownload/{fileName}` | query param `?filePath={fullPath}` |
| Giá trị file | `encodeURIComponent(fileName)` (encode cả dấu `/`) | **full path** server trả (vd `/ColdeIntelligence/RuleList/rulecatalog_...zip`), URL-encoded |
| Range | HTTP header `Range: bytes=0-N` | query param `&Range=bytes%3D0-N` |
| Accept | `application/octet-stream` | `application/octet-stream` (**giữ nguyên**) |
| Body | không có | body rỗng (`""`) |

## 3. Response thực tế của server (đã verify)

Gọi thử endpoint mới (POST + query params) với credential thật, kết quả quan sát được:

| Thuộc tính | Giá trị |
|-----------|---------|
| Status | **206** Partial Content |
| `content-type` | `application/zip; charset=UTF-8` |
| `content-encoding` | `gzip` (transport-level — `fetch`/undici tự giải nén) |
| `x-file-size` | `1296376` (tổng bytes ZIP thật — **vẫn là header**, dùng như cũ) |
| `content-range` | `bytes=0-1014` (không có `/total`) |
| Body | **base64 text thuần**, bắt đầu `UEsDBBQA...` = base64 của `PK\x03\x04` (magic ZIP) |

**Kết luận quan trọng:**
- Body **KHÔNG phải JSON** dù có thể gửi `Accept: application/json`. Luôn là base64 text của chunk ZIP → **giữ nguyên** `res.text()` + `res.headers.get("x-file-size")`.
- `Accept` không ảnh hưởng kết quả (server trả `content-type: application/zip` + base64 bất kể `Accept`). Vì ta nhận luồng bytes (base64 của ZIP), `application/octet-stream` đúng ngữ nghĩa hơn JSON → **giữ `octet-stream`**.
- 3 thứ thực sự gây 400 là: method, vị trí filePath, vị trí Range.

## 4. Thay đổi code đã thực hiện

### 4.1 `extension/src/services/PegaRuleCatalogClient.ts` — `downloadCatalog()`

filePath chuyển sang query param, giữ nguyên full path server trả (không nhét vào path segment):

```typescript
async downloadCatalog(fileName: string, destDir: string): Promise<string> {
  const auth = await this.pegaClient.getAuthHeader();
  // API mới: resumableDownload nhận filePath qua QUERY param (POST), KHÔNG phải
  // path segment. `fileName` là full path server trả ở /result
  // (vd: /ColdeIntelligence/RuleList/rulecatalog_...zip) — giữ nguyên dấu '/',
  // chỉ encode để nhét an toàn vào query string.
  const url = `${this.baseUrl()}/file/resumableDownload?filePath=${encodeURIComponent(fileName)}`;
  const { csvPath, zipBytes } = await downloadCatalogCsv(url, auth, destDir, this.log);
  this.log(`[Catalog] ✅ Catalog ZIP ${zipBytes} bytes → ${csvPath}`);
  return csvPath;
}
```

### 4.2 `extension/src/services/PegaCatalogDownloader.ts` — `fetchAllChunks()`

Trong vòng lặp tải chunk: `GET`→`POST`, Range từ header → query param, thêm body rỗng, giữ `Accept: application/octet-stream`:

```typescript
// API mới: POST + Range là QUERY param (không phải header), body rỗng.
// Server vẫn trả 206 + base64 text + header x-file-size như cũ.
// Accept=application/octet-stream: ta nhận luồng bytes (base64 text của ZIP),
// không phải JSON — server trả content-type application/zip bất kể Accept.
const sep = url.includes("?") ? "&" : "?";
const chunkUrl = `${url}${sep}Range=${encodeURIComponent(`bytes=${offset}-${end}`)}`;
const res = await fetch(chunkUrl, {
  method: "POST",
  headers: { Authorization: authHeader, Accept: "application/octet-stream" },
  body: "",
});
if (res.status !== 206 && res.status !== 200) {
  throw new Error(`Resumable download failed: HTTP ${res.status}`);
}
```

**Giữ nguyên (không đổi):** đọc base64 bằng `res.text()`, đọc `x-file-size`, decode + nối chunk theo decoded bytes, verify size + magic bytes `PK\x03\x04`, guard SEC-05 (`MAX_CHUNKS`), Zip-Slip (SD-01).

### 4.3 Tests — `extension/src/services/__tests__/PegaCatalogDownloader.test.ts`

- `mockFetchRanged`: parse `Range` từ **URL query** (`/[?&]Range=.../`) thay vì `init.headers.Range`.
- Thêm regression test khẳng định: `method === "POST"`, `Accept === "application/octet-stream"`, `body === ""`, URL chứa `Range=` và `filePath=`.
- Giữ các test integrity: size mismatch, ZIP magic, Zip-Slip, multi-chunk reassembly, fallback khi thiếu `x-file-size`.

**Kết quả:** `npx vitest --run src/services/__tests__/PegaCatalogDownloader.test.ts` → **8 passed (8)**.

## 5. Việc còn lại (chưa làm — tùy chọn đồng bộ tài liệu)

- `documents/API-USAGE.md`: Bước 4 vẫn mô tả cách GET cũ → nên cập nhật sang POST + query params + full `filePath`.
- `README.md`: changelog v1.46.3 mô tả thay đổi này nhưng code trước đó chưa áp dụng → nên thêm changelog entry ghi rõ đã thực sự áp dụng ở lần fix này.

## 6. Cách nghiệm thu cuối cùng

Index lại Pega project. Thành công khi: không còn `HTTP 400`, không rơi vào BFS fallback, log hiện `[Catalog] ✅ Catalog ZIP {bytes} bytes → ...`.

## 7. Phạm vi file đã đụng chạm

| File | Thay đổi |
|------|----------|
| `extension/src/services/PegaRuleCatalogClient.ts` | `downloadCatalog()` — build URL `?filePath=` query param |
| `extension/src/services/PegaCatalogDownloader.ts` | `fetchAllChunks()` — POST + Range ở query + body rỗng; JSDoc cập nhật |
| `extension/src/services/__tests__/PegaCatalogDownloader.test.ts` | Parse Range từ query + regression test POST/query |
