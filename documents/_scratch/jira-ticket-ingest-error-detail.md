h2. Context

Extension gọi Backend để ingest source code vào Knowledge Base qua các endpoint {{POST /api/index/source}}, {{POST /api/index/full}}, {{POST /api/index/ingest-docs}}, và MCP {{tools/call mem_sync_code}}. Review cho thấy error surfacing đã có nền tảng (retry backoff, Output channel "Kiro Indexer", status-bar tooltip khi backend báo {{failed}}), nhưng còn nhiều chỗ *nuốt lỗi hoặc mất chi tiết* khiến developer khó fix bug — phải SSH backend đọc pino log thay vì thấy từ IDE.

Ticket này gom các gap về error detail để một AI khác có thể pick up và implement theo severity.

h2. Findings by severity

h3. High — mất thông tin lỗi cho developer

*1. Backend {{indexError}} trả "Internal error" cho mọi 500 — vi phạm rule {{backend-structure}}*

File: {{backend/src/server/routes/api-index.ts}} (function {{indexError}}, cuối file)
{code:typescript}
function indexError(c, err, logger, context) {
    if (String(err?.message).startsWith('PROJECT_REQUIRED')) {
        return c.json({ error: 'X-Project-Id required for indexing' }, 400);
    }
    logger.error({ err }, context);
    return c.json({ error: 'Internal error' }, 500);   // ← Không có details/action
}
{code}
Client chỉ thấy {{HTTP 500: Internal error}}. Không biết file nào sai, quota nào full, disk nào đầy.
Pattern tham chiếu đúng: {{handleSyncPegaRules}} trong cùng file dùng {{{ error, details: err.message }}} — pattern này nên áp dụng cho {{indexError}}.

*2. Client {{httpPostWithDetail}} vứt {{err.body}} — mất {{details}}/{{action}} từ backend*

File: {{extension/src/services/IndexerHttpClient.ts}} (method {{httpPostWithDetail}}, ~line 540)
{code:typescript}
} catch (err: any) {
    const status = err?.statusCode || err?.status || 0;
    const msg = err?.message || String(err);
    if (status === 401) return { ok: false, error: "Unauthorized", status: 401 };
    return { ok: false, error: msg.slice(0, 200), status };   // ← err.body bị bỏ
}
{code}
{{httpRequestJson}} trong {{extension/src/utils/http-client-utils.ts}} đã gắn {{err.body = parsed}} chứa {{{error, details, action}}} từ backend. Client chỉ dùng {{err.message}} và cắt 200 ký tự. Cần đọc thêm {{err.body?.details}}, {{err.body?.action}} và forward về caller (đổi return shape thành {{{ ok, error, details?, action?, status }}}).

*3. Backend nuốt reason khi write file thất bại*

File: {{backend/src/server/routes/api-index.ts}}
- {{handleIndexSource}}: {{catch { rejected.push(file.path); \}}} (mất {{err.code}} = ENOSPC/EACCES/ENAMETOOLONG)
- {{writeFilesPhase}}: cùng pattern

Fix: log {{err.code}} + {{err.path}} qua {{logger.warn}} và thêm {{rejectedReasons: [{file, code, message\}]}} vào response.

*4. Client {{triggerDocumentIngest}} nuốt error hoàn toàn*

File: {{extension/src/services/IndexerHttpClient.ts}} (~line 255)
{code:typescript}
private async triggerDocumentIngest(token?: string): Promise<void> {
    try {
        await this.httpPostWithDetail(`${this.backendUrl}/api/index/ingest-docs`, {}, token);
    } catch { /* non-fatal */ }
}
{code}
Ba vấn đề cùng lúc:
* {{catch}} là dead code — {{httpPostWithDetail}} không throw (nó trả {{{ok, error, status\}}}).
* Không check {{.ok}} → dù backend trả 500 vẫn im lặng.
* {{ingestDocuments}} caller sau đó vẫn báo {{✅ Indexed: N files}} cho user mặc dù KB ingest có thể đã fail hoàn toàn.

Fix: check {{result.ok}}, log URL + status + body ra "Kiro Indexer" output; nếu fail thì trả {{errors += ingested}} và {{showWarningMessage}}.

*5. {{syncCodeSymbols}} nuốt error, IndexingService in message misleading*

File: {{extension/src/services/IndexerHttpClient.ts}} (~line 498) và {{extension/src/services/IndexingService.ts}} (~line 159)
{code:typescript}
try {
    const response = await fetch(...);
    if (!response.ok) { return null; }  // ← Không kèm status/body
    ...
} catch { return null; }
{code}
IndexingService chỉ in {{⚠️ Code symbol sync failed — run manually via mem_sync_code}} — không có status code, URL, body. Cần đổi return type thành {{{ok, message, status?, error?\}}} và surface đầy đủ.

h3. Medium — error tồn tại nhưng ở kênh khó tìm

*6. Network error dùng {{console.debug}} — không hiển thị trong VS Code Output*

File: {{extension/src/services/IndexerHttpClient.ts}}
- {{httpPostJsonOnce}} (~line 495): {{console.debug(...); return { status: 0, body: "" \};}}
- {{httpGetOnce}} (~line 623): tương tự

Fix: đổi thành {{IndexerHttpClient.getIndexerOutput().appendLine(...)}} để hiển thị URL + error message của {{err}} (ECONNREFUSED / DNS / TLS / timeout).

*7. {{readFileContent}} và {{parseIngestResponse}} dùng {{console.warn/debug}}*

File: {{extension/src/services/IndexerHttpClient.ts}} (~line 527, ~line 649)
Cùng vấn đề (6) — đổi sang Output channel.

*8. Backend {{handleIngestDocsFromTemp}} không trả per-file failure detail*

File: {{backend/src/server/routes/api-index.ts}}
{code:typescript}
} catch (err) {
    errors++;
    logger.warn({ err, file: relPath }, '[ingest-docs] Failed to ingest document');
}
...
return c.json({ ingested, errors, total: files.length });
{code}
Frontend chỉ thấy {{errors: 5}} — không biết file nào, lý do gì.

Fix: thêm {{failedFiles: [{file, reason\}]}} vào response.

*9. Backend {{writeFilesPhase}} không log {{rejected}} list*

Trong khi {{handleIndexDocuments}} có log {{logger.warn({ rejected \}, ...)}} thì {{writeFilesPhase}} (dùng chung) không log. Cần bổ sung.

h3. Low — bug nhỏ / dead code

*10. {{IndexingService.refreshTokenFn}} là dead code*

File: {{extension/src/services/IndexingService.ts}}
Field {{refreshTokenFn}} (line 23) không bao giờ được set từ bên ngoài (grep repo). Hệ quả:
* {{pollTaskWorkerProgress}} không thể refresh token khi 401.
* Line 126: {{uploadSourceFiles(report, token, this.refreshTokenFn)}} — arg thứ 3 signature là {{log?: (msg: string) => void}}, đang truyền {{refreshTokenFn}} kiểu {{() => Promise<string | undefined>}}. TypeScript accept vì bivariant, nhưng semantic lệch. Vì {{refreshTokenFn}} luôn undefined nên hiện tại chỉ là noop.

Fix: hoặc wire {{refreshTokenFn}} từ AuthManager (nếu cần cho long-running index vượt JWT TTL), hoặc xoá field và đổi call thành {{uploadSourceFiles(report, token, msg => this.log(msg))}} để hiển thị progress vào Output channel. {{IndexerHttpClient.setTokenRefresher}} đã được wire trong {{extension/src/indexer.ts:77}} — token refresh cho HTTP layer đã hoạt động, nên field trên IndexingService là thừa.

*11. {{httpPostWithDetail}} hardcode {{status: 200}} cho success*

File: {{extension/src/services/IndexerHttpClient.ts}} (~line 544)
Mất phân biệt 200 vs 202 vs 204. Không critical nhưng caller có thể muốn biết 202 (Accepted async) — hiện tại thấy 200 cho hết.

Fix: đọc {{result.status}} thật từ underlying response (cần {{httpRequestJson}} return {{{status, body\}}} chứ không chỉ throw).

*12. {{pollIndexProgress}} timeout 300s không log lý do*

File: {{extension/src/services/IndexerHttpClient.ts}} (~line 95, ~line 201)
Khi timeout, chỉ hiện {{$(warning) Index timeout}} 5s trên status bar — không log lý do (last known phase/percentage), không mở Output.

Fix: khi timeout, log last progress snapshot vào Output channel và giữ status bar lâu hơn.

h2. Đề xuất triển khai (theo thứ tự)

# *Phase 1 (High)*: (1) → (2) → (3) → (4) → (5). Đây là 5 gap chính khiến dev phải SSH backend log.
# *Phase 2 (Medium)*: (6) + (7) chung 1 refactor (chuyển console.* → Output channel). (8) + (9) là backend response enrichment.
# *Phase 3 (Low)*: (10) dọn dead code + fix arg mismatch. (11) + (12) nếu còn thời gian.

h2. Acceptance criteria

# Mọi 4xx/5xx response từ backend ingest endpoints đều có {{{ error, details?, action?\}}} (không còn generic "Internal error").
# Client hiển thị đầy đủ {{details}} + {{action}} từ backend response trong Output channel + toast.
# Không còn {{catch { /* silent */ \}}} block ở luồng ingest — mọi error được log ra "Kiro Indexer" Output.
# Backend response từ {{/api/index/source}} và {{/api/index/ingest-docs}} bao gồm {{failedFiles/rejectedReasons}} với {{{ file, code, message \}}}.
# {{console.debug/console.warn}} trong luồng ingest được thay bằng Output channel calls.
# Dev có thể phân biệt: ENOSPC vs EACCES vs 429 backpressure vs 401 token expired chỉ từ Output channel — không cần đọc backend log.
# Unit tests cho: {{httpPostWithDetail}} forward {{err.body}}, {{indexError}} include details, {{triggerDocumentIngest}} propagate ok/error.
# {{npm run build}} + {{npm test}} pass ở cả {{backend/}} và {{extension/}}.

h2. Files chính sẽ thay đổi

|| Layer || File ||
| Backend | {{backend/src/server/routes/api-index.ts}} |
| Extension | {{extension/src/services/IndexerHttpClient.ts}} |
| Extension | {{extension/src/services/IndexingService.ts}} |
| Extension (test) | {{extension/src/services/__tests__/indexer-http-proxy.test.ts}} |
| Extension (utils, có thể) | {{extension/src/utils/http-client-utils.ts}} (nếu cần return status thay vì throw) |

h2. Related rules

* {{.kiro/steering/code-standards.md}} — exception handling ("KHÔNG nuốt exception", "LUÔN thể hiện exception cho user biết")
* {{.kiro/steering/no-workaround-rule.md}} — fix root cause, không patch symptom
* Backend rule: API response phải có {{{ error, details?, action? \}}}, không được fail silently

h2. Non-goals

* KHÔNG refactor toàn bộ retry/polling logic — chỉ enrich error surfacing.
* KHÔNG thay đổi contract của {{parseIngestResponse}}, {{UNCONVERTIBLE}} legacy marker.
* KHÔNG động vào Pega ingest flow ({{PegaStreamIngester}}, {{PegaProjectIndexer}}) — chỉ focus source code + document ingest.
