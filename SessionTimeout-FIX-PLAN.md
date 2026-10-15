# Fix Plan — Pega Rule Ingest "Invalid or expired token" (Session Timeout)

> **Mục tiêu:** Sửa triệt để lỗi connection broken khi ingest source code project Pega. Tài liệu này dành cho một AI/dev khác thực thi. Mô tả rõ root cause, file cần sửa, chữ ký hàm mới, và cách verify.
>
> **⛔ Không workaround.** Fix phải thống nhất về một nguồn token duy nhất (`AuthManager`) và tái dùng đúng pattern 401-refresh-retry đã có sẵn ở download path. Không được bắt 401 rồi login lại thủ công, không hardcode retry login.

---

## 1. Triệu chứng

Trong `documents/SessionTimeout.md`:

- Download rule từ Pega: **HTTP 200 bình thường**
  `[PegaHttpClient] 📡 POST .../rules/instance => HTTP 200`
- Ingest rule vào KB backend: **fail toàn bộ sau một lúc**
  `[Pega Ingester] ❌ Ingest POST failed (skipping): Ingest failed: Invalid or expired token`
- Bulk-check cũng dính: `[Catalog] ⚠️ Bulk-check failed (bulk-check HTTP 401 Unauthorized)`

Ingest một project Pega kéo dài rất lâu (~33.677 rules) → access JWT hết hạn giữa chừng.

---

## 2. Root cause

`"Invalid or expired token"` **không đến từ Pega** — nó do middleware JWT của backend KB phát ra:

- `backend/src/server/middleware/jwt-auth.ts` → `isExpired(payload)` → `unauthorized('TOKEN_INVALID', 'Invalid or expired token')`
- `backend/src/server/middleware/verifiers/LocalHS256Verifier.ts` → `token_expired`

### 2.1 Asymmetry — hai client, chỉ một có refresh

| Path | Client | Có refresh-on-401? |
|------|--------|--------------------|
| Download rule / source upload | `IndexerHttpClient` | ✅ Có `tokenRefresher` + retry (SA4E-99, SA4E-300) |
| **Ingest Pega rule vào KB** | `PegaStreamIngester` | ❌ Chỉ có `getTokenSync()`, không refresh, không retry |

### 2.2 Ba lỗ hổng xếp chồng

1. **Contract quá hẹp:** `PegaStreamIngester` và `PegaBfsIndexer` / `PegaCatalogIndexer` chỉ nhận `authManager?: { getTokenSync(): string }`. `getTokenSync()` chỉ trả `this.cachedToken` — snapshot bộ nhớ, **không bao giờ refresh**.
   - `extension/src/auth/AuthManager.ts`:
     ```ts
     getTokenSync(): string { return this.cachedToken || ""; }
     ```
2. **Đọc token một lần, đồng bộ, không check hết hạn** trước mỗi POST trong vòng lặp dài. Có ở cả 3 call site của `PegaStreamIngester`:
   ```ts
   const token = this.authManager?.getTokenSync();
   if (token) { headers['Authorization'] = `Bearer ${token}`; }
   ```
3. **Nuốt lỗi 401 rồi skip**, không refresh-retry:
   - `extension/src/services/PegaBfsIndexer.ts` → `ingestAndDiscover()` catch block:
     ```ts
     this.log(`[Pega Ingester] ❌ Ingest POST failed (skipping): ${err.message}...`);
     return { ingested: false, relatives: [] };
     ```

### 2.3 Vì sao timer refresh có sẵn vẫn không cứu

`AuthManager` có `scheduleAccessRefresh()` (refresh tại 70% lifetime) + `TokenRefreshTimer`, và chúng vẫn cập nhật `cachedToken`. **Nhưng** ingester đọc token qua `getTokenSync()` tại thời điểm gửi; nếu request bay ngay sau khi token hết hạn và trước khi timer kịp xoay, hoặc nếu một loạt request dùng chung snapshot cũ, thì 401 vẫn xảy ra và **không có cơ chế retry** để phục hồi. Cần refresh **chủ động theo nhu cầu + retry khi 401**, không chỉ dựa vào timer nền.

---

## 3. Dependency chain (để biết sửa ở đâu)

```
IndexingService
  └─ new PegaCatalogIndexer(..., { getTokenSync: () => this.currentToken() })
        └─ new PegaBfsIndexer(..., authManager)
              └─ new PegaStreamIngester(backendUrl, authManager)   ← nơi gửi HTTP ingest
  └─ new PegaProjectIndexer(..., { getTokenSync: () => this.currentToken() })
        └─ (tương tự nếu dùng BfsIndexer)
```

Pattern 401-refresh-retry mẫu để tái dùng: `extension/src/services/IndexerHttpClient.ts`
- `setTokenRefresher(refresher: () => Promise<string | undefined>)`
- `httpPostJson` / `httpGet`: nếu `status === 401 && this.tokenRefresher` → `await this.tokenRefresher()` → retry một lần với token mới → `notifyTokenRefreshed(fresh)`.

---

## 4. Thiết kế fix

### 4.1 Mở rộng auth contract của ingest path

Định nghĩa một interface chung thay cho `{ getTokenSync(): string }`. Đặt tại `extension/src/services/PegaStreamIngester.ts` (hoặc nơi dùng chung như `extension/src/utils/backend-auth-headers.ts`).

```ts
/**
 * Auth provider cho ingest path. Hỗ trợ lấy token hiện tại (sync, nhanh)
 * và refresh chủ động khi backend trả 401 giữa một job dài.
 */
export interface IngestAuthProvider {
  /** Token hiện tại từ cache (có thể rỗng). Dùng cho lần gửi đầu. */
  getTokenSync(): string;
  /**
   * Refresh access token một lần (rotate qua refresh_token).
   * @returns token mới, hoặc undefined nếu refresh thất bại / phiên đã chết.
   */
  refreshToken(): Promise<string | undefined>;
}
```

> **Lưu ý tương thích:** `AuthManager.refreshToken()` hiện trả `Promise<void>`. Có 2 lựa chọn — chọn **(A)** để không đổi chữ ký công khai của `AuthManager`:
>
> - **(A) Adapter tại call site (khuyến nghị):** nơi tạo provider cho ingester, bọc lại:
>   ```ts
>   const ingestAuth: IngestAuthProvider = {
>     getTokenSync: () => authManager.getTokenSync(),
>     refreshToken: async () => { await authManager.refreshToken(); return authManager.getTokenSync() || undefined; },
>   };
>   ```
>   Pattern này đã dùng sẵn ở `CommandRegistrar.ts`:
>   `async () => { await authManager?.refreshToken(); return authManager?.getTokenSync() || undefined; }`
> - **(B) Thêm overload** `getFreshToken(): Promise<string | undefined>` vào `AuthManager`. Nhiều việc hơn, không cần thiết.

### 4.2 Sửa `PegaStreamIngester` — refresh-on-401 cho cả 3 HTTP call

**File:** `extension/src/services/PegaStreamIngester.ts`

**Đổi field + constructor:**
```ts
// cũ:
private readonly authManager?: { getTokenSync(): string };
constructor(backendUrl: string, authManager?: { getTokenSync(): string }) { ... }

// mới:
private readonly auth?: IngestAuthProvider;
constructor(backendUrl: string, auth?: IngestAuthProvider) {
  this.backendUrl = backendUrl;
  this.auth = auth;
}
```

**Thêm helper dựng header + helper refresh-retry (private):**
```ts
/** Dựng headers với Bearer token hiện tại (sync). */
private authHeaders(projectId: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'X-Project-Id': projectId, ...(extra ?? {}) };
  const token = this.auth?.getTokenSync();
  if (token) { headers['Authorization'] = `Bearer ${token}`; }
  return headers;
}

/**
 * Gửi một request; nếu 401 và có refresh → rotate token một lần rồi retry.
 * @param send - nhận token (có thể undefined) và trả về Response.
 */
private async fetchWithAuthRetry(
  send: (token: string | undefined) => Promise<Response>,
): Promise<Response> {
  let token = this.auth?.getTokenSync() || undefined;
  let res = await send(token);
  if (res.status !== 401 || !this.auth) { return res; }
  const fresh = await this.auth.refreshToken();
  if (!fresh) { return res; }            // phiên đã chết → trả 401 gốc cho caller xử lý
  token = fresh;
  return send(token);                    // retry đúng MỘT lần
}
```

**Áp dụng cho 3 call site** (hiện mỗi chỗ đang tự `getTokenSync()` + `fetch`):

1. `submitJob()` — POST `/api/v1/pega/ingest-stream` (streaming NDJSON).
   - ⚠️ Body là `ReadableStream` → **không thể replay** sau khi đã consume. Vì vậy với stream upload, phải **refresh token TRƯỚC khi mở stream** nếu token sắp hết hạn, hoặc dựng lại `ReadableStream` mới trong lần retry. Giải pháp an toàn: tách phần tạo `readable` thành factory `makeBody()` và gọi lại trong `send`:
     ```ts
     const makeBody = () => new ReadableStream<Uint8Array>({ /* ... như cũ ... */ });
     const res = await this.fetchWithAuthRetry((token) => {
       const headers = this.authHeaders(projectId, { 'Content-Type': 'application/x-ndjson' });
       if (token) { headers['Authorization'] = `Bearer ${token}`; }
       return fetch(endpoint, { method: 'POST', headers, body: makeBody(), duplex: 'half' } as any);
     });
     ```
2. `pollUntilComplete()` — GET `/api/v1/pega/jobs/:id` (idempotent, retry an toàn).
3. `ingestSingleRule()` — POST `/api/v1/pega/ingest-rule` (body là JSON string → replay an toàn).
   - Sau khi `fetchWithAuthRetry`, nếu `res` vẫn 401 → vẫn parse envelope như cũ; `json.error.message` = "Invalid or expired token" sẽ throw và được caller xử lý (xem 4.3).

### 4.3 Sửa `PegaBfsIndexer.ingestAndDiscover` — đừng nuốt lỗi auth

**File:** `extension/src/services/PegaBfsIndexer.ts`

- Đổi field/constructor `authManager?: { getTokenSync(): string }` → `auth?: IngestAuthProvider`, truyền xuống `new PegaStreamIngester(backendUrl, auth)`.
- Trong catch block của `ingestAndDiscover`: phân biệt lỗi **auth** với lỗi thường. Vì `PegaStreamIngester` đã tự refresh-retry một lần, nếu vẫn ra 401 nghĩa là **phiên thực sự chết** → không nên tiếp tục ingest hàng nghìn rule nữa (tất cả sẽ fail). Nên:
  - Vẫn `return { ingested: false }` cho rule hiện tại (giữ nó eligible để retry run sau — đúng như comment hiện có).
  - **Nhưng** set một cờ `this.authDead = true` và cho vòng lặp BFS **dừng sớm có kiểm soát** + log rõ:
    ```ts
    const isAuthErr = /invalid or expired token|unauthorized|TOKEN_INVALID/i.test(err?.message ?? '');
    if (isAuthErr) {
      this.authDead = true;
      this.log(`[Pega Ingester] ⛔ Auth hết hạn và refresh thất bại — dừng ingest để tránh skip toàn bộ. Hãy login lại rồi chạy lại (state đã preserve).`);
    }
    ```
  - Nơi vòng lặp BFS lấy việc: nếu `this.authDead` → break và báo cáo "paused due to auth", thay vì chạy tiếp và skip 25.000 rule.
  - ⚠️ **Không tự động login** — chỉ dừng sạch sẽ và báo user. State local đã preserve nên lần chạy sau là incremental.

### 4.4 Sửa `PegaCatalogIndexer` (và `PegaProjectIndexer` nếu tương tự)

**File:** `extension/src/services/PegaCatalogIndexer.ts`

- Đổi `authManager?: { getTokenSync(): string }` → `auth?: IngestAuthProvider`.
- Truyền xuống `new PegaBfsIndexer(..., this.auth)`.
- `tokenProvider` cho `BulkCheckClient`/`BackendHttpPoster` (dòng ~143): giữ nguyên `getTokenSync()` cho lần đầu, **nhưng** `BackendHttpPoster` nên cũng hỗ trợ refresh-on-401 (xem 4.5) để bulk-check không còn fail 401 như trong log.

### 4.5 (Khuyến nghị) Bulk-check cũng refresh-on-401

Lỗi `bulk-check HTTP 401 Unauthorized` trong log → `BulkCheckClient` / `BackendHttpPoster` cũng dùng token tĩnh.

**File:** nơi định nghĩa `BackendHttpPoster` (tìm bằng `grep "class BackendHttpPoster"`).

- Cho `BackendHttpPoster` nhận `IngestAuthProvider` (hoặc một `tokenRefresher`) thay vì chỉ `() => string`, và áp dụng cùng `fetchWithAuthRetry` một lần trên POST bulk-check.

### 4.6 Nơi tạo `IngestAuthProvider` (wiring)

**File:** `extension/src/services/IndexingService.ts`

- Hiện truyền `{ getTokenSync: () => this.currentToken() }`. Đổi thành provider đầy đủ:
  ```ts
  const ingestAuth: IngestAuthProvider = {
    getTokenSync: () => this.currentToken(),
    refreshToken: async () => {
      if (!this.refreshTokenFn) { return undefined; }
      const fresh = await this.refreshTokenFn();   // đã có sẵn trong IndexingService
      if (fresh) { this.token = fresh; }           // giữ this.token đồng bộ (SA4E-300 GAP 4)
      return fresh;
    },
  };
  const catalogIndexer = new PegaCatalogIndexer(this.httpClient, this.outputChannel, this.log.bind(this), ingestAuth);
  const indexer = new PegaProjectIndexer(this.httpClient, this.outputChannel, this.log.bind(this), ingestAuth);
  ```
- `this.refreshTokenFn` được set từ `handleIndexWorkspace` args (xem `CommandRegistrar.ts`): `async () => { await authManager?.refreshToken(); return authManager?.getTokenSync() || undefined; }`. Xác nhận nó được gán vào `IndexingService` (nếu chưa, thêm setter).

---

## 5. Danh sách file cần sửa (checklist)

| # | File | Thay đổi |
|---|------|----------|
| 1 | `extension/src/services/PegaStreamIngester.ts` | Thêm `IngestAuthProvider`; đổi field/constructor; thêm `authHeaders()` + `fetchWithAuthRetry()`; áp dụng cho `submitJob`/`pollUntilComplete`/`ingestSingleRule`; `submitJob` dùng `makeBody()` factory để stream replay-able |
| 2 | `extension/src/services/PegaBfsIndexer.ts` | Đổi `authManager` → `auth: IngestAuthProvider`; truyền xuống ingester; catch block phân biệt lỗi auth, set `authDead`, dừng BFS sớm + log; **không auto-login** |
| 3 | `extension/src/services/PegaCatalogIndexer.ts` | Đổi `authManager` → `auth`; truyền xuống `PegaBfsIndexer`; nối refresh cho bulk-check poster |
| 4 | `extension/src/services/PegaProjectIndexer.ts` | Tương tự Catalog nếu có dùng BfsIndexer/ingester |
| 5 | `extension/src/services/IndexingService.ts` | Tạo `IngestAuthProvider` đầy đủ (getTokenSync + refreshToken) thay cho `{ getTokenSync }`; đảm bảo `refreshTokenFn` được set |
| 6 | `BackendHttpPoster` / `BulkCheckClient` (tìm file) | (Khuyến nghị) refresh-on-401 cho bulk-check |
| 7 | `extension/src/types/server-types.ts` | Nếu dùng chung interface auth, cân nhắc để `AuthManager` thỏa `IngestAuthProvider` (đã có `getTokenSync` + `refreshToken(): Promise<void>` — dùng adapter 4.1A) |

---

## 6. Chữ ký hàm mới (tổng hợp)

```ts
// PegaStreamIngester.ts
export interface IngestAuthProvider {
  getTokenSync(): string;
  refreshToken(): Promise<string | undefined>;
}

class PegaStreamIngester {
  constructor(backendUrl: string, auth?: IngestAuthProvider);
  private authHeaders(projectId: string, extra?: Record<string, string>): Record<string, string>;
  private fetchWithAuthRetry(send: (token: string | undefined) => Promise<Response>): Promise<Response>;
}

// PegaBfsIndexer.ts
class PegaBfsIndexer {
  constructor(/* ...existing... */, auth?: IngestAuthProvider);
  private authDead: boolean; // mới
}

// PegaCatalogIndexer.ts / PegaProjectIndexer.ts
constructor(/* ...existing... */, auth?: IngestAuthProvider);
```

---

## 7. Cách verify (bắt buộc)

### 7.1 Unit test (Vitest) — `extension/src/services/__tests__/`
- **PegaStreamIngester.ingestSingleRule**: mock `fetch` trả `401` lần 1, `200` lần 2; mock `auth.refreshToken()` trả token mới. Assert: refresh được gọi đúng 1 lần, request thứ 2 dùng token mới, kết quả = success.
- **401 refresh thất bại**: `auth.refreshToken()` trả `undefined` → assert không retry vô hạn, trả lỗi để caller xử lý.
- **Stream submitJob**: assert body được dựng lại (`makeBody` gọi 2 lần) khi retry.
- **PegaBfsIndexer.ingestAndDiscover**: khi ingester throw lỗi auth sau refresh → assert `authDead=true` và BFS dừng, KHÔNG tiếp tục skip hàng loạt.

### 7.2 Regression
- `npm test` trong `extension/` phải xanh (đặc biệt `auth-manager.test.ts`, `token-refresh-timer.test.ts`, `http-client.test.ts`).
- Build: `npm run build` / `npm run compile` trong `extension/`.

### 7.3 Manual (nếu có môi trường Pega)
- Chạy index một project Pega lớn, cho access token hết hạn giữa chừng (hoặc hạ `expiresIn` để ép hết hạn nhanh).
- Kỳ vọng: không còn hàng loạt `Ingest POST failed ... Invalid or expired token`; thay vào đó log cho thấy refresh + tiếp tục ingest; hoặc nếu refresh_token cũng chết thì dừng sạch với thông báo "login lại", không skip 25k rule.

---

## 8. Nguyên tắc tuân thủ

- **Single source of truth:** mọi token đều từ `AuthManager` (qua `IngestAuthProvider`). Không hardcode, không login lại thủ công trong ingester.
- **Không workaround:** không `?? fallback token`, không bắt 401 rồi bỏ qua. 401 → refresh-retry-một-lần → nếu vẫn chết thì dừng có kiểm soát và báo user.
- **Idempotency:** GET poll retry an toàn; POST single-rule replay-able (JSON); stream phải dùng body factory để replay được.
- **Preserve state:** lần chạy sau là incremental (local index đã backfill), nên dừng sớm khi auth chết là an toàn.
