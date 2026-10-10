# Fix Guide — 3 bug che giấu lỗi xác thực (auth) Pega CodeIntelligence

> Tài liệu này viết cho một AI/agent **không có lịch sử hội thoại trước đó**. Đọc toàn bộ phần Context trước khi sửa. Mục tiêu: làm cho extension **báo đúng lỗi 401** thay vì "xanh giả", KHÔNG phải để "qua được" lỗi auth.

---

## 1. Bối cảnh dự án (Project Context)

- **Repo extension:** `C:\DEV\projects\kiro\SDLC-Agents-4-Enteprise\extension` (VS Code / Kiro extension, TypeScript).
  - Đây là mã nguồn thật của extension đang chạy. KHÔNG phải workspace đang mở.
- **Workspace người dùng đang mở:** `c:\DDrive\projects\collection\PegaColl` — là một "Pega project" (có `pega-project.json`). Extension coi rule Pega = source code và tải rule về khi "Index Source Code".
- **Server Pega:** `https://fecrdt-coll-stg1-internal.pegacloud.io/prweb`
- **Operator:** `duc.nguyen.10@fecredit.com.vn`
- **Proxy công ty (bắt buộc):** `kiroSdlc.proxy.mode=manual`, host `10.30.168.246:9090`. Pega host KHÔNG nằm trong bypass list nên mọi request tới Pega đi qua proxy. Mọi `fetch()` trong extension đã được patch để đi qua proxy (`src/proxy/global-fetch-patch.ts`).

Tech stack: TypeScript, undici (proxy dispatcher), Zod, Pino. Quy ước code: SOLID, **file ≤ 200 dòng, hàm ≤ 20 dòng**, tách model khỏi logic, không nuốt exception, luôn báo lỗi cho người dùng.

---

## 2. Triệu chứng (Symptoms)

1. Bấm **Test Connection** → báo ✅ xanh ("reachable").
2. Bấm **Fetch Pega Context** → báo ✅ xanh: `Fetched context: App "PegaApp" (0 CaseTypes)`, ghi file `pega-project.json` với `applicationName="PegaApp"`, `applicationVersion=""`, `accessGroup=""`.
3. Bấm **Index Source Code** → báo ❌ đỏ: `HTTP 401 Unauthorized`.

Người dùng thấy "vô lý": 2 nút xanh nhưng index 401.

### Log thực tế (Output channel "SDLC Indexing")
```
[Pega Indexer] ⚠️ Catalog export failed (... HTTP 401) — falling back to BFS crawl.
[Pega Indexer] 🏛️ Pega Project Detected: "pega:PegaApp"
[PegaHierarchy] Step 1: Resolving Operator "duc.nguyen.10@fecredit.com.vn"...
[PegaHttpClient] 📡 POST https://fecrdt-coll-stg1-internal.pegacloud.io/prweb/api/CodeIntelligence/v1/rules/instance?insKey=DATA-ADMIN-OPERATOR-ID%20DUC.NGUYEN.10%40FECREDIT.COM.VN => HTTP 401 (0 bytes)
[PegaHierarchy] Step 1 WARN: Could not fetch Operator: HTTP 401 Unauthorized
...
[Pega Indexer] ❌ Fatal error: Crawl plan failed: Unauthorized
[PegaDiscovery] → .../api/CodeIntelligence/v1 app=HRAppsV2:01.01
[Pega Discovery] ⚠️ skipped: backend 401: {"error":{"code":"TOKEN_INVALID"}}
```

---

## 3. Nguyên nhân gốc (Root Cause) — ĐỌC KỸ

**Chỉ có MỘT nguyên nhân thật:** Basic auth của operator `duc.nguyen.10` bị server trả **HTTP 401** khi gọi custom REST service `/api/CodeIntelligence/v1/*`. (Có thể do password lưu sai/cũ trong SecretStorage, hoặc operator bị auto-disable — operator rule ghi `pyOpAvailable:"false"` và "ID disabled". Việc chẩn đoán auth KHÔNG thuộc phạm vi fix này.)

**Vấn đề cần sửa:** 3 chỗ trong code **che giấu** lỗi 401 này, làm người dùng tưởng thành công và mất thời gian debug:

| # | Nơi | Hành vi sai | Hệ quả |
|---|-----|-------------|--------|
| 1 | `PegaSettingsHandler.test()` | GET endpoint gốc KHÔNG gửi auth, coi mọi `status > 0` là ✅ | 401 vẫn báo xanh |
| 2 | `PegaHierarchyResolver.resolveOperator()` + `resolvePegaHierarchy()` | Nuốt lỗi 401 → trả `accessGroup=""` → fallback `appName="PegaApp"` | App name/version sai, không báo lỗi |
| 3 | `PegaCodeIntelDiscovery.resolveAppInfo()` | Hardcode `return {appName:"HRAppsV2", appVersion:"01.01"}` + không đọc field `applicationVersion` | Gọi API vào app sai (`HRAppsV2`) |

> ⚠️ **RÀNG BUỘC TUYỆT ĐỐI:** KHÔNG được "sửa" 401 bằng cách bỏ qua auth, tắt kiểm tra, hay hardcode token/app. Mục tiêu là **phơi bày lỗi đúng**, không phải làm nó biến mất. KHÔNG sửa proxy, KHÔNG sửa cơ chế SecretStorage, KHÔNG xoá file. Giữ nguyên chữ ký (signature) các hàm public. Tuân thủ ≤200 dòng/file, ≤20 dòng/hàm.

---

## 4. Các bản sửa (chính xác file:line, code hiện tại → mục tiêu)

### FIX #1 — Test Connection phải kiểm tra auth thật

**File:** `src/panels/settings/handlers/PegaSettingsHandler.ts` — method `test()`

**Code hiện tại:**
```ts
/** Connectivity-only test (no auth) with a bounded 8s timeout (OI-7). */
async test(): Promise<void> {
  try {
    const { PegaHttpClient } = await import("../../../services/PegaHttpClient");
    const client = new PegaHttpClient(this.secrets);
    const endpoint = client.getPegaEndpoint();
    const res = await fetch(endpoint, { method: "GET", signal: AbortSignal.timeout(8000) });
    const message = res.status > 0
      ? `✅ Network OK — Pega Server reachable (HTTP ${res.status}). Authentication not tested.`
      : "Connection failed: no response from server";
    this.postMessage({ type: "pegaTestResult", success: res.status > 0, message });
  } catch (err: any) {
    this.postMessage({ type: "pegaTestResult", success: false, message: `Connection failed: ${err.message}` });
  }
}
```

**Vấn đề:** GET endpoint gốc, không gửi `Authorization`, và `success = res.status > 0` nên 401/403/404 đều báo thành công.

**Code mục tiêu:** gọi một endpoint data chuẩn CÓ auth header và đánh giá status cho đúng. Dùng `getAuthHeader()` (đã có sẵn trên client) và endpoint `/api/v1/data/D_OperatorID`.
```ts
/** Auth-aware connectivity test with a bounded 8s timeout (OI-7). */
async test(): Promise<void> {
  try {
    const { PegaHttpClient } = await import("../../../services/PegaHttpClient");
    const client = new PegaHttpClient(this.secrets);
    const base = client.getPegaEndpoint().replace(/\/$/, "");
    const authHeader = await client.getAuthHeader();
    const res = await fetch(`${base}/api/v1/data/D_OperatorID`, {
      method: "GET",
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    this.postMessage(this.buildTestResult(res.status));
  } catch (err: any) {
    this.postMessage({ type: "pegaTestResult", success: false, message: `Connection failed: ${err.message}` });
  }
}

/** Map an HTTP status to a user-facing Pega test result (keeps test() ≤20 lines). */
private buildTestResult(status: number): { type: string; success: boolean; message: string } {
  if (status === 200) {
    return { type: "pegaTestResult", success: true, message: "✅ Connected — credentials accepted (HTTP 200)." };
  }
  if (status === 401 || status === 403) {
    return { type: "pegaTestResult", success: false, message: `❌ Authentication failed (HTTP ${status}). Check Operator ID / password or account status.` };
  }
  return { type: "pegaTestResult", success: false, message: `❌ Unexpected response (HTTP ${status}).` };
}
```
> Lưu ý: tách `buildTestResult` để `test()` vẫn ≤ 20 dòng. Nếu `getAuthHeader()` không public trên `PegaHttpClient`, kiểm tra `src/services/pega/PegaHttpCore.ts` — nó là method public `getAuthHeader()`; `PegaHttpClient extends PegaHttpCore` nên gọi được.

---

### FIX #2 — Hierarchy resolver không được nuốt lỗi auth, không fallback "PegaApp"

**File:** `src/services/PegaHierarchyResolver.ts`

**2a. `resolveOperator()` — code hiện tại:**
```ts
async function resolveOperator(
  client: PegaHttpClient, opId: string, root: string, log: LogFn,
): Promise<{ insKey: string; accessGroup: string }> {
  const insKey = `DATA-ADMIN-OPERATOR-ID ${opId.toUpperCase()}`;
  log(`[PegaHierarchy] Step 1: Resolving Operator "${opId}"...`);
  try {
    const obj = await client.getRuleByInsKey(insKey);
    saveHierarchyRule(obj, root, log, "DATA-ADMIN-OPERATOR-ID", opId);
    const ag = (obj.pyAccessGroup as string) || (obj.pyDefaultAccessGroup as string) || "";
    log(`[PegaHierarchy] Step 1 OK: Access Group = "${ag}"`);
    return { insKey, accessGroup: ag };
  } catch (err: any) {
    log(`[PegaHierarchy] Step 1 WARN: Could not fetch Operator: ${err.message}`);
    return { insKey, accessGroup: "" };   // ← NUỐT LỖI
  }
}
```

**Mục tiêu:** lỗi auth (401/403/Unauthorized) phải **re-throw**; chỉ "not found" mới được coi là mềm (trả rỗng) nếu logic hiện có cần. Thêm phân loại:
```ts
async function resolveOperator(
  client: PegaHttpClient, opId: string, root: string, log: LogFn,
): Promise<{ insKey: string; accessGroup: string }> {
  const insKey = `DATA-ADMIN-OPERATOR-ID ${opId.toUpperCase()}`;
  log(`[PegaHierarchy] Step 1: Resolving Operator "${opId}"...`);
  try {
    const obj = await client.getRuleByInsKey(insKey);
    saveHierarchyRule(obj, root, log, "DATA-ADMIN-OPERATOR-ID", opId);
    const ag = (obj.pyAccessGroup as string) || (obj.pyDefaultAccessGroup as string) || "";
    log(`[PegaHierarchy] Step 1 OK: Access Group = "${ag}"`);
    return { insKey, accessGroup: ag };
  } catch (err: any) {
    if (isAuthError(err)) {                                   // ← FAIL LOUD cho auth
      log(`[PegaHierarchy] Step 1 FAIL (auth): ${err.message}`);
      throw new Error(`Pega authentication failed while resolving operator "${opId}": ${err.message}`);
    }
    log(`[PegaHierarchy] Step 1 WARN: Could not fetch Operator: ${err.message}`);
    return { insKey, accessGroup: "" };
  }
}

/** True when a Pega error represents an authentication/authorization failure. */
function isAuthError(err: { message?: string }): boolean {
  const m = (err?.message || "").toLowerCase();
  return m.includes("401") || m.includes("403") || m.includes("unauthorized") || m.includes("forbidden");
}
```

**2b. `resolvePegaHierarchy()` — bỏ fallback "PegaApp".** Code hiện tại (phần return):
```ts
return {
  seeds: Array.from(seeds),
  operatorId,
  accessGroup,
  appName: appName || "PegaApp",   // ← fallback giả
  appVersion: appVersion || "",
  ruleSets: appResult.mergedRuleSets,
  dependedApps: appResult.dependedAppNames,
  accessGroups: appResult.accessGroups,
};
```
**Mục tiêu:** nếu không resolve được `appName`, ném lỗi rõ ràng thay vì bịa "PegaApp":
```ts
if (!appName) {
  throw new Error(
    `Cannot resolve Pega Application for operator "${operatorId}" ` +
    `(accessGroup="${accessGroup || "<empty>"}"). Verify credentials/permissions for the CodeIntelligence service.`
  );
}
return {
  seeds: Array.from(seeds),
  operatorId,
  accessGroup,
  appName,
  appVersion,
  ruleSets: appResult.mergedRuleSets,
  dependedApps: appResult.dependedAppNames,
  accessGroups: appResult.accessGroups,
};
```
> ⚠️ Có nhiều caller của `resolvePegaHierarchy`/`resolveDeterministicPegaHierarchy` (crawl indexer, ruleset resolver). Việc đổi sang throw là ĐÚNG mục tiêu (fail-loud), nhưng phải đảm bảo mỗi caller bắt lỗi và báo cho người dùng (xem FIX #3 cho `fetchAndSavePegaContext`). Kiểm tra các caller: `src/services/PegaProjectIndexer.ts`, `src/services/PegaRuleSetResolverService.ts`, `src/services/pega/PegaContextClient.ts`. Caller indexer đã có try/catch log "❌ Fatal error" nên vẫn an toàn.

---

### FIX #3 — Fetch Context không được ghi file khi resolve thất bại

**File:** `src/services/pega/PegaContextClient.ts` — `fetchAndSavePegaContext()`

**Hành vi hiện tại:** luôn ghi `pega-project.json` kể cả khi `result.appName` là "PegaApp" (giá trị bịa). Sau FIX #2, `resolveDeterministicPegaHierarchy` sẽ **throw** khi không resolve được → hàm này sẽ throw theo và KHÔNG ghi file. Cần đảm bảo:
1. KHÔNG bọc try/catch nuốt lỗi quanh `resolveDeterministicPegaHierarchy` ở đây.
2. Chỉ `writeFile(pega-project.json)` SAU khi đã có `result.appName` hợp lệ (đã được FIX #2 đảm bảo). Không cần sửa thêm nếu hàm chỉ gọi và để lỗi propagate.

**File:** `src/panels/settings/handlers/PegaSettingsHandler.ts` — `fetchContext()`

**Code hiện tại** (KHÔNG có try/catch → lỗi propagate không kiểm soát):
```ts
async fetchContext(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    this.postMessage({ type: "pegaContextFetched", success: false, message: "No workspace folder open to save Pega context." });
    return;
  }
  const { PegaHttpClient } = await import("../../../services/PegaHttpClient");
  const client = new PegaHttpClient(this.secrets);
  const result = await client.fetchAndSavePegaContext(folders[0].uri.fsPath);
  this.postMessage({
    type: "pegaContextFetched",
    success: true,
    message: `Fetched context: App "${result.applicationName}" (${result.caseTypesCount} CaseTypes) → saved ${result.filePath}`,
  });
}
```

**Code mục tiêu:** bọc try/catch, báo lỗi rõ cho người dùng khi fetch thất bại (bây giờ 401 sẽ ném từ FIX #2):
```ts
async fetchContext(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    this.postMessage({ type: "pegaContextFetched", success: false, message: "No workspace folder open to save Pega context." });
    return;
  }
  try {
    const { PegaHttpClient } = await import("../../../services/PegaHttpClient");
    const client = new PegaHttpClient(this.secrets);
    const result = await client.fetchAndSavePegaContext(folders[0].uri.fsPath);
    this.postMessage({
      type: "pegaContextFetched",
      success: true,
      message: `Fetched context: App "${result.applicationName}" (${result.caseTypesCount} CaseTypes) → saved ${result.filePath}`,
    });
  } catch (err: any) {
    this.postMessage({ type: "pegaContextFetched", success: false, message: `❌ Fetch Pega Context failed: ${err.message}` });
  }
}
```

---

### FIX #4 — Bỏ hardcode "HRAppsV2:01.01" + đọc đúng field version

**File:** `src/services/PegaCodeIntelDiscovery.ts` — `resolveAppInfo()`

**Code hiện tại:**
```ts
private resolveAppInfo(root: string): { appName: string; appVersion: string } {
  const candidates = [
    path.join(root, "pega-project.json"),
    path.join(root, ".kiro", "pega-project.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const json = JSON.parse(fs.readFileSync(p, "utf-8")) as {
          appName?: string; version?: string; appVersion?: string;
        };
        const appName = json.appName || (json as any).applicationName;
        const appVersion = json.version || json.appVersion;        // ← BỎ SÓT applicationVersion
        if (appName && appVersion) return { appName, appVersion };
      }
    } catch { /* ignore malformed */ }
  }
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  const appName = config.get<string>("pegaAppName", "").trim();
  const appVersion = config.get<string>("pegaAppVersion", "").trim();
  if (appName && appVersion) return { appName, appVersion };
  return { appName: "HRAppsV2", appVersion: "01.01" };               // ← HARDCODE SAI
}
```

**Vấn đề:**
- `pega-project.json` do extension ghi dùng field `applicationName` / `applicationVersion` (xem `PegaContextClient.ts`), nhưng hàm này chỉ đọc `json.version || json.appVersion` → bỏ sót `applicationVersion`.
- Fallback cuối hardcode `HRAppsV2:01.01` → gọi API vào app sai hoàn toàn.

**Code mục tiêu:** đọc đủ các field, và nếu không resolve được thì **throw** (để lỗi hiện ra), KHÔNG hardcode:
```ts
private resolveAppInfo(root: string): { appName: string; appVersion: string } {
  const candidates = [
    path.join(root, "pega-project.json"),
    path.join(root, ".kiro", "pega-project.json"),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) { continue; }
      const json = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, string>;
      const appName = json.appName || json.applicationName;
      const appVersion = json.version || json.appVersion || json.applicationVersion;
      if (appName && appVersion) { return { appName, appVersion }; }
    } catch { /* ignore malformed */ }
  }
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  const appName = config.get<string>("pegaAppName", "").trim();
  const appVersion = config.get<string>("pegaAppVersion", "").trim();
  if (appName && appVersion) { return { appName, appVersion }; }
  throw new Error(
    "Cannot resolve Pega application for discovery: no valid appName/appVersion in " +
    "pega-project.json or kiroSdlc.pegaAppName/pegaAppVersion. Run 'Fetch Pega Context' first."
  );
}
```
> `resolveAppInfo` được gọi trong `run()` của cùng file. Vì `run()` nằm trong chuỗi `runPegaCodeIntelDiscovery` (`src/services/IndexingService.ts`) đã có try/catch log "⚠️ skipped", throw ở đây sẽ hiển thị thông báo rõ ràng thay vì gọi nhầm `HRAppsV2`. Xác nhận caller bắt lỗi trước khi hoàn tất.

---

## 5. Thứ tự thực hiện

1. FIX #2 trước (resolver fail-loud) — vì FIX #3 phụ thuộc việc resolver ném lỗi.
2. FIX #3 (Fetch Context báo lỗi, không ghi file sai).
3. FIX #1 (Test Connection auth-aware).
4. FIX #4 (Discovery bỏ hardcode).

## 6. Build & Lint

Chạy trong `C:\DEV\projects\kiro\SDLC-Agents-4-Enteprise\extension`:
```
npm run build       # hoặc: npm run compile / tsc -p .  (kiểm tra package.json để lấy script đúng)
npm run lint        # nếu có
npm test            # nếu có test cho các file đụng tới (Vitest)
```
Yêu cầu: build/tsc PASS, không lỗi type. Mỗi hàm sửa vẫn ≤ 20 dòng, mỗi file ≤ 200 dòng (nếu vượt do thêm helper, tách helper ra file phù hợp theo chuẩn code).

## 7. Kịch bản verify (sau khi sửa)

Có 2 trạng thái cần kiểm, tuỳ credential thực tế:

**A. Credential đang 401 (trạng thái hiện tại):**
- Test Connection → PHẢI báo ❌ `Authentication failed (HTTP 401)`, KHÔNG còn xanh giả.
- Fetch Pega Context → PHẢI báo ❌ `Fetch Pega Context failed: ... 401 ...`, và `pega-project.json` KHÔNG bị ghi đè bằng `PegaApp`.
- Index Source Code → vẫn báo lỗi 401 (hành vi đúng, giữ nguyên).
- Discovery → báo lỗi "Cannot resolve Pega application..." thay vì gọi `HRAppsV2`.

**B. Credential hợp lệ (sau khi người dùng sửa password / mở khoá operator):**
- Test Connection → ✅ `Connected — credentials accepted (HTTP 200)`.
- Fetch Pega Context → ✅ ghi `pega-project.json` với app THẬT (vd `FECreditCA` / `03.01.01`, accessGroup `FECreditCA:Administrators`), KHÔNG phải `PegaApp`.
- Index Source Code → chạy crawl bình thường.

## 8. Danh sách file sẽ đụng tới

- `src/panels/settings/handlers/PegaSettingsHandler.ts` (FIX #1, FIX #3)
- `src/services/PegaHierarchyResolver.ts` (FIX #2)
- `src/services/pega/PegaContextClient.ts` (xác nhận FIX #3 — không nuốt lỗi; thường không cần sửa code, chỉ kiểm tra)
- `src/services/PegaCodeIntelDiscovery.ts` (FIX #4)

## 9. Những điều TUYỆT ĐỐI KHÔNG làm

- ❌ Không bỏ qua/tắt auth để "cho qua" 401.
- ❌ Không hardcode app name/version/token ở bất kỳ đâu.
- ❌ Không sửa proxy, SecretStorage, hay `global-fetch-patch.ts`.
- ❌ Không xoá `pega-project.json` hay bất kỳ file rule nào.
- ❌ Không đổi chữ ký hàm public (giữ API ổn định cho caller).
- ❌ Không "vá case-by-case" (vd chỉ hard-set `FECreditCA`). Sửa đúng cơ chế fail-loud.

## 10. Giải thích "vì sao từng nút cho kết quả khác nhau" (để agent hiểu bối cảnh)

| Nút | Gọi gì | Có gửi auth? | Vì sao kết quả như hiện tại |
|-----|--------|--------------|------------------------------|
| Test Connection | `GET /prweb` | ❌ Không | Xanh giả: chỉ cần `status>0`, 401 vẫn xanh (FIX #1) |
| Fetch Pega Context | `getRuleByInsKey` → `/api/CodeIntelligence/v1/rules/instance` | ✅ Basic | 401 → nuốt lỗi → ghi `PegaApp` (FIX #2, #3) |
| Index Source Code | cùng `/api/CodeIntelligence/v1/*` | ✅ Basic | 401 → throw → đỏ (đúng, giữ nguyên) |

Sau khi sửa, cả 3 nút sẽ **nhất quán**: nếu credential 401 thì cả 3 cùng báo lỗi auth rõ ràng; nếu credential đúng thì cả 3 cùng chạy đúng với app thật.
