h2. Context

Khi "Index Source Code" cho *Pega workspace*, extension hiện tại luôn *download rule content từ Pega server* (qua {{PegaHttpClient.getRuleByInsKey}} — Service 1 {{POST /rules/instance}}) cho mọi rule được xác định là "changed/new" bởi bulk-check delta. Rule sau khi fetch được lưu side-effect xuống {{<root>/rules/<safeClass>/<safeName>.pega.json}} (via {{PegaCrawlHelper.saveRuleFile}}) rồi ingest vào backend qua {{POST /api/v1/pega/ingest-rule}}.

Vấn đề: nếu local workspace đã có file rule ({{*.pega.json}}) *khớp checksum* với rule trên server, việc download lại là lãng phí bandwidth + thời gian, đặc biệt với rulebase lớn (hàng nghìn rules).

*Feature mong muốn*: Thêm một *option* cho phép, đối với Pega workspace, *ưu tiên đọc rule content từ local file* khi phát hiện local file có checksum trùng khớp checksum của rule trên Pega server. Chỉ download từ server khi local file thiếu / không đọc được / checksum lệch.

h2. Trạng thái hiện tại (đã điều tra)

*Luồng index Pega:*
* Command {{kiroSdlc.indexWorkspace}} → {{extension/src/indexer.ts}} {{handleIndexWorkspace}} → {{IndexingService.indexWorkspace}}.
* {{IndexingService.runPegaProjectIndexer}} ({{extension/src/services/IndexingService.ts}} ~line 231): mặc định dùng {{PegaCatalogIndexer}} (setting {{pega.useCatalogExport}}, default true), fallback {{PegaProjectIndexer}} (BFS, deprecated).
* {{PegaCatalogIndexer.run}} ({{extension/src/services/PegaCatalogIndexer.ts}}): export → download CSV catalog (mỗi row có sẵn cột {{checksum}}) → {{applyIncrementalSkip}} (bulk-check delta) → fetch + ingest chỉ những item "changed/new" qua {{PegaBfsIndexer.run}}.

*Checksum:*
* Công thức: {{computePegaChecksum(r)}} tại {{extension/src/code-intel/checksum/PegaRuleChecksumStrategy.ts:22}} = {{sha256( trim(pzInsKey) + "|" + trim(pxUpdateDateTime) + "|" + trim(pxSaveDateTime) )}} — CHỈ 3 field, lowercase hex (SA4E-241, invariant NT-2/INV-1).
* Lưu tại backend DB: {{files.content_hash}} (via {{PegaSymbolSync.ts}}). Backend KHÔNG tự tính checksum — extension là single authority.
* Bulk-check delta: {{extension/src/code-intel/delta/BulkCheckClient.ts}} → {{POST /api/v1/pega/rulecatalog/bulk-check}} → so sánh checksum server-vs-backendDB. *KHÔNG* consult local file. Fail-safe: lỗi bulk-check → treat existing=∅ → full re-fetch ({{StateComparer.ts}}).

*Local rule file:*
* Location: {{<workspaceRoot>/rules/<safeClass>/<safeName>.pega.json}} (full rule JSON, pretty-printed).
* Ghi bởi {{PegaCrawlHelper.saveRuleFile}} ({{PegaCrawlHelper.ts:183}}) — *idempotent*, skip nếu file đã tồn tại.
* {{safeClass}} = {{pxObjClass}} sanitized; {{safeName}} = {{pyRuleName||pyPropertyName||pyActivityName||...}} sanitized.
* *Không có map trực tiếp {{pzInsKey → file path}}* — filename derive từ {{pxObjClass}}+rule-name. Đây là điểm cần giải quyết (xem Technical Notes).

*Settings hiện có* ({{extension/package.json}}): {{kiroSdlc.pega.useCatalogExport}}, {{pega.fetchBatchSize}}, {{pega.ingestConcurrency}}, ... — *chưa có* setting prefer-local.

h2. Yêu cầu (Requirements)

# Thêm option (setting + tùy chọn hiển thị trong index options UI nếu phù hợp): {{kiroSdlc.pega.preferLocalOnChecksumMatch}} (boolean, default đề xuất {{true}}). Chỉ áp dụng cho Pega workspace.
# Trong luồng fetch rule của {{PegaBfsIndexer.ingestOne}} (hoặc pipeline fetch step): TRƯỚC khi gọi {{getRuleByInsKey}} qua network, kiểm tra local file:
#* Resolve local path từ catalog row / crawl item ({{pxObjClass}} + rule-name).
#* Nếu local file tồn tại → đọc, tính {{computePegaChecksum}} trên 3 field của local rule.
#* Nếu {{computePegaChecksum(localRule) === catalogRow.checksum}} → dùng local content, *bỏ qua network download*.
#* Ngược lại (file thiếu / không parse được / checksum lệch) → fallback download từ server (giữ nguyên hành vi hiện tại).
# Sau khi lấy content (dù từ local hay server): vẫn gọi {{saveRuleFile}} (no-op nếu file đã có) và {{ingestSingleRule}} với *đúng checksum {{computePegaChecksum}} 3-field* — bảo toàn invariant INV-1 (checksum gửi lên backend phải khớp giá trị bulk-check so sánh).
# Log rõ ràng số rule "served from local" vs "downloaded from server" trong summary + Output channel (ví dụ: {{🏛️ Pega: 1200 rules — 950 from local cache, 250 downloaded}}).
# Fail-safe tuyệt đối: KHÔNG BAO GIỜ ingest local content khi checksum không khớp (tránh index rule cũ/sai). Mọi trường hợp nghi ngờ → download từ server.

h2. Technical Notes / Integration points

# *New setting*: {{extension/package.json}} (gần line 328, cạnh {{pega.useCatalogExport}}). Đọc runtime cùng chỗ {{PegaBfsIndexer.readPipelineConfig()}}.
# *Row → local path resolution* (RỦI RO chính): {{saveRuleFile}} derive filename từ {{pxObjClass}}+{{pyRuleName}}, nhưng fetched-rule filename có thể khác catalog-row derivation (fetched dùng chuỗi fallback {{pyRuleName||pyPropertyName||...}}). Đề xuất: xây dựng *manifest mapping {{pzInsKey → relativePath}}* khi {{saveRuleFile}} ghi file (ghi kèm 1 index file, ví dụ {{<root>/rules/.manifest.json}}), để lookup local file robust theo {{pzInsKey}} thay vì reconstruct path. Đây là cách tránh workaround (no-workaround-rule): fix root cause = thiếu insKey→path map.
# *Checksum equality*: reuse {{computePegaChecksum}} ({{PegaRuleChecksumStrategy.ts:22}}) trên 3 field của local rule JSON, so với {{catalogRow.checksum}} (đã được resolve/verify trong {{PegaCatalogCsvParser}} / {{PegaCatalogChecksumResolver}}).
# *Fetch substitution point*: {{PegaBfsIndexer.ingestOne}} ({{extension/src/services/PegaBfsIndexer.ts}} ~line 177-181) — chỗ hiện gọi {{getRuleByInsKey}}. Thêm nhánh "read local" trước network call.
# Catalog row fields khả dụng ({{extension/src/models/PegaCatalogModels.ts}} — {{RuleCatalogRow}}): {{pzInsKey, pxObjClass, pyClassName, pyRuleSet, pyRuleSetVersion, pyLabel, pxUpdateDateTime, pxSaveDateTime, checksum}}.
# *Interaction với bulk-check*: Feature này bổ sung một tầng NGOÀI bulk-check. Bulk-check quyết định "backend đã có chưa"; option mới quyết định "khi cần fetch thì lấy từ đâu (local vs server)". Hai tầng độc lập, không conflict.

h2. Acceptance criteria

# Có setting {{kiroSdlc.pega.preferLocalOnChecksumMatch}} trong {{package.json}} với description rõ ràng, default {{true}}.
# Khi bật + local file khớp checksum → KHÔNG có network call {{getRuleByInsKey}} cho rule đó (verify bằng test/spy đếm số lần gọi HTTP).
# Khi local file thiếu/lệch checksum → vẫn download từ server (hành vi cũ, không regression).
# Checksum gửi lên {{ingest-rule}} luôn là {{computePegaChecksum}} 3-field bất kể source (INV-1 giữ nguyên) — verify bằng test.
# Khi tắt setting → hành vi y hệt hiện tại (luôn download).
# Summary + Output channel hiển thị số rule from-local vs downloaded.
# Local content KHÔNG bao giờ được ingest khi checksum mismatch (fail-safe) — verify bằng test negative case.
# Manifest {{pzInsKey → path}} (nếu chọn approach manifest) được ghi/đọc đúng; hoặc path resolution logic có test cover cả trường hợp filename derivation khác nhau.
# {{npm run build}} + {{npm test}} pass ở {{extension/}} (và {{backend/}} nếu có thay đổi).

h2. Files chính sẽ thay đổi

|| Layer || File || Thay đổi ||
| Extension (setting) | {{extension/package.json}} | Thêm {{kiroSdlc.pega.preferLocalOnChecksumMatch}} |
| Extension | {{extension/src/services/PegaBfsIndexer.ts}} | Nhánh read-local trước download; đọc setting |
| Extension | {{extension/src/services/PegaCrawlHelper.ts}} | (nếu manifest) ghi {{pzInsKey → path}} khi {{saveRuleFile}} |
| Extension (mới) | ví dụ {{extension/src/services/PegaLocalRuleResolver.ts}} | Resolve + đọc + verify checksum local file (SRP, ≤200 LOC) |
| Extension | {{extension/src/services/PegaCatalogIndexer.ts}} | Wire summary counters (local vs downloaded) |
| Extension (test) | {{extension/src/services/__tests__/}} | UT cho resolver + checksum match/mismatch + no-network case |

h2. Related rules

* {{.kiro/steering/no-workaround-rule.md}} — fix root cause (thiếu insKey→path map) thay vì reconstruct path fragile.
* {{.kiro/steering/code-standards.md}} — file ≤200 LOC, function ≤20 LOC, tách model/service, zod validate khi parse local JSON từ external source.
* SA4E-241 invariant INV-1 — checksum ingest phải là {{computePegaChecksum}} 3-field.

h2. Non-goals

* KHÔNG thay đổi công thức {{computePegaChecksum}} hay backend {{content_hash}} storage.
* KHÔNG thay đổi cơ chế bulk-check delta hiện tại.
* KHÔNG áp dụng cho non-Pega workspace (source code thường đã đọc từ local rồi).
* KHÔNG động vào legacy {{PegaProjectIndexer}} (deprecated) — chỉ catalog + BFS path.
