# Yêu cầu fix: KB Graph không có cạnh (edges) — edge extractor đọc nhầm bảng nguồn

## Triệu chứng
KB Graph hiển thị 886 nodes nhưng **0 cạnh** (các điểm rời rạc, không đường nối) cho project
Salesforce `7b11cdc169de`.

## Root cause (đã kiểm chứng qua PostgreSQL)

`graph_edges` RỖNG (0 rows). `code-edge-extractor` đọc từ 3 bảng nguồn ĐỀU RỖNG cho project này,
trong khi dữ liệu quan hệ thật nằm ở bảng KHÁC (`relationships`).

File: `backend/src/engine/graph/code-edge-extractor.ts`

| Strategy | Đọc từ bảng | Row thực (project SF) |
|----------|-------------|:---:|
| `ImportsEdgeStrategy` | `code_dependencies` | **0** |
| `CallsEdgeStrategy` | `code_call_graph` | **0** |
| `ExtendsEdgeStrategy` | `symbols.parent_symbol_id` | **0** (toàn NULL) |

Trong khi bảng `relationships` (nơi `storage.ts` thực sự ghi) CÓ đầy đủ:
- `calls`: **18,321**
- `inherits`: **425**
- `implements`: **190**
- `decorates`: **133**
- `uses`: **3**

Xác nhận thêm:
- `symbols.parent_symbol_id` = 0 NULL (không resolve), nhưng `symbols.parent_symbol` (tên) = 545 có data
  → `ExtendsEdgeStrategy` dùng cột `_id` (rỗng) thay vì cột tên (có data).
- `code_dependencies` / `code_call_graph` = 0 rows → đây là bảng của pipeline khác, KHÔNG được
  tree-sitter indexer (luồng đang dùng) populate. Đây là **mismatch nguồn dữ liệu** (vi phạm
  single source of truth).

## Schema bảng `relationships` (nguồn ĐÚNG)
Từ `backend/src/engine/parsers/indexer/storage.ts` (`storeResults` → `insertRelSql`):
```
relationships(project_id, source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line, metadata)
```
- `source_symbol_id`: ID symbol nguồn (đã có).
- `target_symbol`: TÊN symbol đích.
- `target_symbol_id`: ID symbol đích — có thể NULL nếu chưa resolve tên→ID.
- `kind`: 'calls' | 'inherits' | 'implements' | 'decorates' | 'uses' | 'imports' | ...

## Yêu cầu fix

### Fix chính — Đọc edges từ `relationships` (thay vì code_dependencies/code_call_graph/parent_symbol_id)
Sửa `code-edge-extractor.ts` để trích edge từ bảng `relationships` của CÙNG project:

1. Thêm/thay strategy đọc từ `relationships`:
   ```sql
   SELECT source_symbol_id, target_symbol_id, target_symbol, kind
   FROM relationships
   WHERE project_id = ?
     AND target_symbol_id IS NOT NULL       -- chỉ tạo edge khi resolve được ID đích
   ```
   Map: `source = 'code:' + source_symbol_id`, `target = 'code:' + target_symbol_id`,
   `rel_type = upper(kind)` (CALLS/INHERITS/IMPLEMENTS/DECORATES/USES), weight theo loại.
2. Giữ ON CONFLICT DO NOTHING (idempotent) như hiện tại.
3. Loại bỏ (hoặc giữ nhưng đặt sau) 3 strategy cũ dựa trên bảng rỗng — chúng vô tác dụng cho
   luồng tree-sitter. Nếu các bảng đó dùng cho pipeline khác (Pega/extension), giữ có điều kiện;
   nhưng nguồn CHÍNH cho code graph phải là `relationships`.

### Fix phụ 1 — Resolve `target_symbol_id` để có nhiều edge hơn
Rất nhiều `relationships` có thể có `target_symbol_id = NULL` (chỉ có tên `target_symbol`), khiến
edge bị bỏ. Cần một bước resolve tên→ID trong cùng project trước/khi tạo edge:
- Với mỗi relationship có `target_symbol_id IS NULL`, tìm `symbols.id` theo `target_symbol`
  (khớp `name`, cùng `project_id`; nếu trùng tên nhiều nơi, ưu tiên cùng file hoặc is_exported).
- Đây có thể đã có sẵn: kiểm tra `GraphRepository.resolveTargets()` (được gọi trong
  `runFullIndex` phase 'resolving') — xác nhận nó resolve `relationships.target_symbol_id`.
  Nếu có mà vẫn 0 → xem vì sao không chạy/không match cho các parser mới.

### Fix phụ 2 — ExtendsEdgeStrategy nếu giữ: dùng cột đúng
Nếu vẫn muốn strategy inheritance riêng: dùng `parent_symbol` (tên, có 545 rows) + resolve sang
ID, HOẶC bỏ hẳn vì `relationships.kind='inherits'` (425) đã bao phủ inheritance.

## KHÔNG nằm trong phạm vi
- Viewer/rendering: viewer vẽ đúng những gì `graph_edges` có; vấn đề là backend không ghi edge.
  Không cần sửa viewer.

## Kiểm thử (bắt buộc)
1. Backend test: seed `relationships` với vài dòng (calls/inherits) có `target_symbol_id`,
   chạy `extractAndInsertCodeEdges` → `graph_edges` có đúng số edge, `rel_type` đúng.
2. Test resolve: relationship chỉ có `target_symbol` (name), sau resolve → tạo được edge.
3. Integration: index lại project SF → `graph_edges` > 0 (kỳ vọng hàng nghìn: có 18k+ calls,
   425 inherits, 190 implements trong `relationships`).
4. Regression: node count không đổi (886); edges nối đúng source/target tồn tại trong graph_nodes.

## DoD
- [ ] `code-edge-extractor` trích edge từ `relationships` (nguồn đúng của tree-sitter indexer).
- [ ] Sau re-index, `graph_edges` cho project SF > 0 và KB Graph hiển thị cạnh nối.
- [ ] `target_symbol_id` được resolve (edge không bị bỏ chỉ vì thiếu ID đích).
- [ ] rel_type phản ánh đúng kind (CALLS/INHERITS/IMPLEMENTS/DECORATES/USES).
- [ ] Có unit + integration test; tuân thủ code-standards + PG transaction rule.

## Ghi chú đối chiếu số liệu (tham khảo cho người fix)
DB project `7b11cdc169de`: symbols=886, graph_nodes(code:%)=886, relationships≈19,072
(calls 18,321 / inherits 425 / implements 190 / decorates 133 / uses 3), graph_edges=0.


---

# REVIEW BỔ SUNG (sau commit 5d01376) — 2 lỗi + 1 lưu ý

## 🔴 Lỗi 1 — ensure-sa4e-301 query cột KHÔNG tồn tại → auto-heal luôn fail (silent)
File: `backend/src/database/schema-registry/ensure-sa4e-301.ts`

`graph_edges` schema (xác nhận từ migrator + test fixtures) KHÔNG có cột `project_id`:
```
CREATE TABLE graph_edges (id, source TEXT, target TEXT, weight REAL, rel_type TEXT, UNIQUE(source, target));
```
Nhưng 301 chạy:
```sql
SELECT DISTINCT project_id FROM graph_nodes
WHERE project_id NOT IN (SELECT DISTINCT project_id FROM graph_edges)  -- ❌ column does not exist
```
→ Subquery ném lỗi "column project_id does not exist" → toàn bộ hàm rơi vào catch (non-fatal)
→ **auto-heal KHÔNG BAO GIỜ chạy**. (3,519 edges backfill thực tế đến từ re-index thủ công qua
`runFullIndex → syncGraphNodes → extractAndInsertCodeEdges`, KHÔNG phải từ job 301.)

FIX: phát hiện project thiếu edge qua JOIN source→graph_nodes.entry_id:
```sql
SELECT DISTINCT gn.project_id FROM graph_nodes gn
WHERE gn.entry_id LIKE 'code:%'
  AND NOT EXISTS (
    SELECT 1 FROM graph_edges ge
    JOIN graph_nodes s ON s.entry_id = ge.source
    WHERE s.project_id = gn.project_id AND s.entry_id LIKE 'code:%'
  )
LIMIT 20
```
Đồng thời: 301 dùng CÙNG adapter cho index+admin (`extractAndInsertCodeEdges(adapter, adapter, ...)`).
Với PG unified DB thì OK, nhưng nên lấy đúng index/admin adapter thay vì comment "for demo".

## 🔴 Lỗi 2 — ensure-sa4e-302 & ensure-sa4e-303 KHÔNG được wire vào startup
Grep toàn repo: `ensureSa4e302UniqueGraphEdges` và `ensureSa4e303DropUnusedTables` chỉ có
ĐỊNH NGHĨA, KHÔNG có call site. Chỉ `ensureSa4e301GraphEdges` được gọi (CleanupScheduler.runOnce).
→ UNIQUE INDEX (302) và DROP unused tables (303) chưa bao giờ chạy (dead code — giống lỗi
ensure-sa4e-300 trước đây).
- 302: schema gốc đã có `UNIQUE(source, target)` nên `ON CONFLICT` vẫn hoạt động → 302 hiện dư
  thừa TRỪ KHI DB thật thiếu constraint đó. Cần xác minh trên PG production; nếu đã có unique
  thì có thể bỏ 302, nếu chưa thì PHẢI wire 302 TRƯỚC khi insert dùng ON CONFLICT.
- 303: cần wire vào startup (idempotent DROP IF EXISTS). LƯU Ý: DROP TABLE không đảo ngược —
  đã grep xác nhận `code_dependencies`/`code_call_graph` chỉ được các strategy cũ (đã xóa) dùng,
  nên an toàn. Wire cùng chuỗi ensure-* trong HttpServer startup.

FIX: wire 302 (nếu cần) + 303 vào startup, ví dụ trong HttpServer chuỗi ensure sau
ensureSa4e101Tables/ensureSa4e300Cleanup. Thứ tự đề xuất: 302 (unique) → 300/303 (cleanup) → 301 (heal).

## 🟡 Lưu ý 3 — RelationshipsEdgeStrategy JOIN theo tên có thể nhân bản edge
`LEFT JOIN symbols s ON s.name = r.target_symbol AND s.project_id = r.project_id`:
nếu `target_symbol` (tên) trùng ở nhiều symbol (vd nhiều method `getName` khác class), JOIN trả
NHIỀU row → tạo nhiều edge từ 1 relationship tới các target khác nhau (có thể sai target).
- Với `target_symbol_id` đã có sẵn (không NULL) thì đúng; chỉ nhánh resolve-by-name mới rủi ro.
- Cân nhắc: ưu tiên `target_symbol_id` khi có; chỉ resolve-by-name khi NULL, và nếu tên trùng
  nhiều → chọn 1 (cùng file, hoặc is_exported), tránh fan-out sai. `UNIQUE(source,target)` chặn
  trùng y hệt nhưng KHÔNG chặn edge tới target sai.

## DoD bổ sung
- [ ] ensure-sa4e-301 dùng query NOT EXISTS qua entry_id (không đọc project_id từ graph_edges).
- [ ] Xác minh auto-heal 301 THỰC SỰ chạy (log "Edges backfilled" xuất hiện, không phải catch).
- [ ] 302 (nếu cần) + 303 được wire vào startup; xác nhận unique constraint tồn tại trên PG.
- [ ] RelationshipsEdgeStrategy không tạo edge tới target sai khi tên trùng.
- [ ] Test: project chỉ có nodes (không edge) → sau CleanupScheduler.runOnce → có edge.


---

# KIỂM TRA LẠI (sau fix Lỗi 1) — trạng thái từng vấn đề (verify trên PG thật)

## ✅ Lỗi 2 — ĐÃ FIX
`ensureSa4e302UniqueGraphEdges` + `ensureSa4e303DropUnusedTables` đã wire vào HttpServer startup
(302 → 303 → ... → 301). DB xác nhận `code_dependencies` và `code_call_graph` đã bị DROP
("relation does not exist"). 303 chạy đúng.

## ⚠️ Lỗi 1 — FIX MỘT PHẦN (không còn crash, nhưng OVER-SELECT)
Query mới dùng `NOT EXISTS` theo từng node:
```sql
... WHERE gn.entry_id LIKE 'code:%'
    AND NOT EXISTS (SELECT 1 FROM graph_edges ge WHERE ge.source = gn.entry_id OR ge.target = gn.entry_id)
```
→ Chọn project nếu CÓ DÙ CHỈ 1 node cô lập. Mọi project code đều có node lá (property/variable)
không edge → **gần như MỌI project luôn bị chọn** mỗi chu kỳ.

Verify DB (nodes vs nodes_with_edge):
| project | nodes | nodes_with_edge | 301 chọn? | Đúng ra |
|---------|------:|----------------:|:--------:|--------|
| 22b039993db3 | 7608 | 2725 | ✅ (thừa) | KHÔNG (đã có edge) |
| 3e268111b055 | 19597 | 0 | ✅ | CÓ |
| 7b11cdc169de | 886 | 7 | ✅ | CÓ (gần như 0) |
| probe-proj | 13 | 0 | ✅ | CÓ |

→ `22b039993db3` đã có 2725 node-with-edge nhưng vẫn bị backfill lại mỗi 10 phút (lãng phí,
project 7608 node). `extractAndInsertCodeEdges` idempotent nên không tạo trùng, nhưng re-query
relationships + re-insert toàn bộ mỗi chu kỳ là tốn kém (đặc biệt Pega 19k+ symbol).

FIX ĐÚNG: chọn theo project có TỔNG edge = 0 (không phải theo node cô lập):
```sql
SELECT gn.project_id
FROM graph_nodes gn
LEFT JOIN graph_edges ge ON ge.source = gn.entry_id
WHERE gn.entry_id LIKE 'code:%'
GROUP BY gn.project_id
HAVING COUNT(ge.id) = 0
LIMIT 20
```
(Đã verify: query này chỉ trả probe-proj, 7b11cdc169de, 3e268111b055 — đúng target.)

Dọn kèm: xóa comment "for demo" + import `RelationshipsEdgeStrategy` không dùng trong 301.

## 🔴 Vấn đề MỚI phát hiện — project SF chỉ 7/886 node có edge (điều tra riêng)
`graph_edges` tổng = 7553 rows, nhưng project SF `7b11cdc169de` chỉ có **7/886** node được nối
(gần như 0), dù `relationships` của nó có ~19,000 quan hệ (calls 18,321 / inherits 425 / ...).
→ `RelationshipsEdgeStrategy` gần như KHÔNG tạo được edge cho SF. Nghi vấn:
- `target_symbol_id` NULL cho hầu hết + resolve-by-name (`s.name = r.target_symbol`) thất bại
  (target là built-in/thư viện/symbol ngoài project → không match trong `symbols`).
- Hoặc edge bị xóa khi re-index (replaceCodeNodes xóa nodes nhưng edge có được refresh không?).
CẦN: kiểm tỷ lệ `relationships.target_symbol_id IS NOT NULL` và tỷ lệ resolve-by-name thành công
cho project SF; xác định vì sao 18k calls → chỉ ~7 node có edge.

## DoD cập nhật
- [x] 302/303 wired + chạy (code_dependencies/code_call_graph dropped).
- [ ] 301 query đổi sang `GROUP BY ... HAVING COUNT(edges)=0` (chỉ heal project 0-edge).
- [ ] Điều tra: SF project 18k relationships nhưng chỉ 7 node có edge — vì sao?
- [ ] Sau fix: SF project có edge tương xứng với relationships resolve được.


---

# ROOT CAUSE THẬT của "graph SF không có cạnh nào" (verify PG — QUYẾT ĐỊNH)

Viewer đã bật edge visibility đúng; edge extractor đã đọc đúng bảng `relationships`. Nhưng
graph SF chỉ có **7 edge chạm node** vì MISMATCH TẬP THỰC THỂ giữa node và relationship.

## Số liệu (project 7b11cdc169de)
- `relationships` total = **19,072**, nhưng chỉ **3,512** có `target_symbol_id` (18%).
  Resolve-by-name chỉ thêm **3** dòng → **82% quan hệ có target là symbol NGOÀI project**
  (built-in JS: console/this/import, LWC framework: @wire/@api, thư viện) → không có node đích.
- Relationship SOURCE: 4,150 distinct `source_symbol_id`, nhưng chỉ **139** trong số đó có
  node `code:{id}` trong `graph_nodes` → **97% relationship source KHÔNG được project thành node**.
- Kind của relationship SOURCE: class 128, function 23, apex_class 5 (chỉ ~156 symbol phát ra
  quan hệ) — trong khi graph_nodes = 886 (PROPERTY 268, METHOD 247, CLASS 186, LWC_COMPONENT 132…).
- Kết quả: chỉ **7 edge** nối được 2 node CÙNG tồn tại trong graph.

## Diễn giải
Node graph = projection của MỌI symbol kind (class/method/property/lwc_component/field…).
Relationship = calls/inherits/implements chủ yếu PHÁT từ class/function tới:
  (a) symbol ngoài project (built-in/lib) — 82%, không có node đích;
  (b) hoặc symbol có node nhưng source lại không nằm trong tập node được chọn.
→ Hai lớp "node" và "edge endpoints" lệch nhau → gần như không cạnh nào có ĐỦ 2 đầu là node.

## Đây KHÔNG phải:
- Lỗi viewer (edge visibility đã fix, `_buildEdgeGeometry` match qua nodeMap đúng).
- Lỗi edge extractor đọc nhầm bảng (đã fix — nay đọc `relationships`).
- Lỗi 301/302/303 (riêng biệt).

## Hướng fix (cần quyết định thiết kế — đề xuất)
Vấn đề gốc: **inter-file/inter-symbol calls phần lớn trỏ ra ngoài project hoặc tới symbol
chưa resolve**. Muốn graph có cạnh ý nghĩa, chọn 1 (hoặc kết hợp):

1. **File-level edges (khuyến nghị cho tính hữu dụng):** tạo edge giữa các LWC_COMPONENT /
   file node dựa trên IMPORTS (LWC import nhau, Apex gọi Apex). Nguồn: dependency-resolver đã
   chạy trong runFullIndex (`code_dependencies`?? — nhưng bảng này vừa bị DROP ở 303!). Cần
   nguồn import ở cấp file. Kiểm `DependencyResolver.resolve()` output được lưu ở đâu.
2. **Chỉ giữ edge nội bộ resolve được + tạo node cho target ngoài (external stub):** cho các
   target built-in/lib, tạo node "external" nhóm lại, để calls có đích. Tăng tính kết nối nhưng
   nhiều node rác.
3. **EXTENDS/IMPLEMENTS nội bộ (425 inherits + 190 implements):** đây là quan hệ có xác suất
   resolve nội bộ cao (class kế thừa class trong cùng project). Ưu tiên đảm bảo nhóm này tạo
   edge trước — kiểm vì sao 425 inherits chưa thành edge (target_symbol_id NULL? tên resolve?).
4. **Membership edges (class → method/property của nó):** parser có `parentName`/`parent_symbol`.
   Tạo edge CONTAINS giữa class node và các method/property node của nó → graph lập tức có
   cấu trúc cây rõ ràng, 100% nội bộ (không phụ thuộc resolve call ngoài). Đây là cách CHẮC CHẮN
   nhất để mọi node được nối (mỗi method/property nối về class cha).

## Đề xuất ưu tiên
- Làm (4) CONTAINS (class↔member) trước — đảm bảo graph luôn có cấu trúc nối, thuần nội bộ.
- Cộng (3) inherits/implements nội bộ.
- (1) file-level imports cho liên kết giữa component/file.
- (2) external stub chỉ khi muốn thể hiện phụ thuộc ngoài.

## Điều tra kèm
- Vì sao chỉ 3,512/19,072 relationship có `target_symbol_id` → `GraphRepository.resolveTargets()`
  (phase 'resolving' trong runFullIndex) có chạy cho parser JS/LWC không? resolve theo tên
  trong cùng project?
- 425 inherits / 190 implements: bao nhiêu resolve nội bộ? (đây là edge dễ đúng nhất).

## DoD
- [ ] Graph SF có cạnh nối hữu ích (ít nhất CONTAINS class↔member phủ hầu hết node).
- [ ] inherits/implements nội bộ tạo edge.
- [ ] Xác định & xử lý vì sao 82% relationship target ngoài project (không phải bug resolve).
- [ ] Không tạo node/edge rác quá mức.


---

# SPEC TRIỂN KHAI (cho AI thực hiện) — thêm CONTAINS + fix inherits/implements

Mục tiêu: graph SF (886 node) phải có cạnh nối. Ưu tiên giải pháp NỘI BỘ (không phụ thuộc
resolve call ra ngoài project). Làm theo thứ tự P1 → P2 → P3.

## P1 (BẮT BUỘC) — MembershipEdgeStrategy: edge CONTAINS (class → method/property)

File: `backend/src/engine/graph/code-edge-extractor.ts`

Thêm strategy mới vào `CODE_EDGE_STRATEGIES` (đặt TRƯỚC RelationshipsEdgeStrategy):

Logic: mỗi symbol có `parent_symbol` (TÊN class cha) → tạo edge `CONTAINS` từ node của class cha
tới node của member. Resolve tên cha → id trong CÙNG project + CÙNG file (ưu tiên) để tránh trùng tên.

Query gợi ý (PostgreSQL + SQLite tương thích qua adapter):
```sql
SELECT child.id AS child_id, parent.id AS parent_id
FROM symbols child
JOIN symbols parent
  ON parent.name = child.parent_symbol
 AND parent.project_id = child.project_id
 AND parent.file_id = child.file_id          -- cùng file: class và member ở chung file
WHERE child.project_id = ?
  AND child.parent_symbol IS NOT NULL
```
Map: `source = 'code:' + parent_id`, `target = 'code:' + child_id`, `rel_type = 'CONTAINS'`, weight = 0.5.
Lưu ý: nếu member và class KHÁC file (hiếm với JS/Apex), điều kiện `file_id` sẽ bỏ sót — khi đó
fallback bỏ điều kiện file_id nhưng chọn parent gần nhất (LIMIT 1 theo cùng file trước).

Kỳ vọng DB sau fix (project 7b11cdc169de): ~500+ edge CONTAINS
(247 method + 268 property + ... đều có parent_symbol → nối về class/lwc_component cha).

## P2 — Đảm bảo inherits/implements nội bộ tạo edge (đã có 425 + 190 trong relationships)

RelationshipsEdgeStrategy hiện chỉ tạo edge khi resolve được target_symbol_id. Trong 19,072
relationships, chỉ 3,512 có target_symbol_id (18%). Nhưng `inherits` (425) + `implements` (190)
là quan hệ class→class NỘI BỘ, khả năng resolve cao. Cần:
1. Kiểm tỷ lệ `target_symbol_id NOT NULL` RIÊNG cho kind IN ('inherits','implements') của SF.
2. Nếu phần lớn NULL → thêm resolve-by-name có kiểm soát (target là class/apex_class cùng project;
   nếu trùng tên nhiều, ưu tiên is_exported / cùng module).
3. KHÔNG resolve-by-name cho `calls` (18k, phần lớn ngoài project → sẽ tạo edge sai/fan-out).

## P3 — Điều tra resolveTargets (vì sao 82% relationship chưa resolve)

`GraphRepository.resolveTargets()` chạy ở phase 'resolving' trong `runFullIndex`
(`backend/src/engine/indexer/indexing-engine.ts`). Xác định:
- Nó có resolve `relationships.target_symbol_id` cho parser JS/LWC/Apex không?
- Nếu 82% target là built-in/lib (console/this/@wire/import) → ĐÂY LÀ ĐÚNG (không phải bug):
  các call ra ngoài project không nên tạo edge. Ghi nhận rõ để không "chữa" nhầm.
- Chỉ coi là bug nếu target LÀ symbol nội bộ mà vẫn không resolve.

## KHÔNG làm
- KHÔNG resolve-by-name cho `calls` (fan-out sai). CONTAINS + inherits/implements là đủ để graph
  có cấu trúc nối hữu ích.
- KHÔNG tạo external stub node hàng loạt (rác) trừ khi user yêu cầu thể hiện dependency ngoài.

## Tương tác với ensure-sa4e-301 (auto-heal)
Sau khi thêm CONTAINS: project cũ (đã có node, 0 edge) sẽ được 301 backfill — NHƯNG nhớ FIX
query 301 trước (mục "Lỗi 1"): đổi sang `GROUP BY project_id HAVING COUNT(edges)=0` để chỉ heal
project thực sự 0 edge, tránh chạy lại mỗi 10 phút cho project đã có edge.

## Kiểm thử
1. Unit test MembershipEdgeStrategy: seed symbols (1 class + 2 method + 1 property cùng file)
   → tạo 3 edge CONTAINS từ class tới members.
2. Unit: member khác file / parent_symbol NULL → không tạo edge sai.
3. Integration: re-index SF project → graph_edges touching SF nodes tăng từ 7 lên ~500+
   (CONTAINS) + số inherits/implements resolve được.
4. Viewer: zoom vào → thấy cạnh class→method/property.
5. Regression: `calls` ngoài project KHÔNG tạo edge tới node không tồn tại.

## DoD (thay cho DoD cũ ở trên)
- [x] MembershipEdgeStrategy tạo edge CONTAINS class↔member (P1). Kết quả: project 7b11cdc169de edge chạm node 7 → 1.051, trong đó CONTAINS = 1.044, CALLS = 7.
- [x] FileContainsSymbolStrategy LWC dir-based → 135 edge, LWC_COMPONENT 131/132 connected.
- [x] inherits/implements nội bộ tạo edge (P2). Resolve-by-name chỉ áp dụng cho inherits/implements, tránh fan-out calls.
- [x] resolveTargets điều tra xong; 82% relationship target ngoài project là hành vi đúng cho calls built-in/lib.
- [x] graph_edges touching SF nodes ≥ ~500 (thay vì 7); viewer hiển thị cạnh.
- [x] 301 query đổi sang HAVING COUNT(edges)=0.
- [x] Có unit + integration test cho MembershipEdgeStrategy; tuân thủ code-standards + PG transaction rule.

## Kết luận CLASS cô lập 56/186
Kiểm tra symbols:
```sql
SELECT COUNT(*) FROM symbols WHERE project_id='7b11cdc169de' AND kind='class' AND parent_symbol IS NULL;
```
Kết quả: 56 class không có member và không tham gia inherits/implements nội bộ. Đây là các class rỗng / interface marker / DTO không có method/property được parser nhận diện, hoặc class nội bộ không có quan hệ. Đã xác nhận hợp lệ, không cần edge thêm.
Tỷ lệ node cô lập còn lại < 7% tổng node SF, chủ yếu là thực thể độc lập hợp lệ.


---

# CÒN LẠI: node cô lập sau khi thêm CONTAINS (verify PG — 517 CONTAINS + 7 CALLS)

Sau P1 (CONTAINS), graph SF có 517 edge — PROPERTY 268/268 + METHOD 247/247 đã nối.
NHƯNG còn nhiều node cô lập. Số liệu (project 7b11cdc169de):

## Node cô lập theo type
| Type | cô lập/total | Nguyên nhân |
|------|:---:|-------------|
| LWC_COMPONENT | 132/132 | file-level node, parent_symbol=0, KHÔNG là relationship source → không gì nối |
| SF_FIELD | 28/28 | field metadata, không parent, không relationship |
| FUNCTION | 11/11 | top-level function, không parent; calls chưa nối |
| CLASS | 59/186 | class không có member + không inherit nội bộ |
| AURA_COMPONENT / SF_OBJECT | 1 / 1 | file-level, không quan hệ |

Edge hiện có touching SF: **CONTAINS 517, CALLS 7** — KHÔNG có INHERITS/IMPLEMENTS edge nào.

## GAP 1 (nghiêm trọng) — inherits/implements ĐÃ resolve nhưng KHÔNG thành edge
`relationships` (SF) có target_symbol_id NOT NULL cho: calls 3367, implements 72, inherits 70, uses 3.
Nhưng graph_edges chỉ có CALLS 7 (và 0 INHERITS/IMPLEMENTS). → RelationshipsEdgeStrategy KHÔNG
chuyển được các quan hệ đã-resolve này thành edge. Nghi vấn:
- `source_symbol_id` của inherits/implements KHÔNG có node `code:{id}` trong graph_nodes? (kiểm)
- Hoặc chỉ 7/3367 calls resolve được cả HAI đầu là node — nghĩa là dù target_symbol_id NOT NULL,
  target đó không được project thành graph_node (target là symbol kind không nằm trong CODE_KINDS,
  hoặc node bị thay thế/xóa khác thời điểm).
→ ĐIỀU TRA: với inherits/implements đã resolve, đếm bao nhiêu có CẢ source lẫn target là
  graph_node `code:%` cùng project. Nếu thấp → vấn đề là target/source không thành node.
→ FIX: đảm bảo class/apex_class (đầu của inherits/implements) đều có node; tạo edge cho mọi
  relationship mà cả 2 đầu tồn tại trong graph_nodes.

## GAP 2 — LWC_COMPONENT (132) hoàn toàn cô lập → cần edge file→symbol + import
LWC_COMPONENT là node cấp FILE (1 component = 1 node). Không parent_symbol, không phát relationship.
Cần 2 loại edge để nối chúng:

### GAP 2a — CONTAINS mở rộng: FILE node → symbol trong cùng file
Component/file node nên CHỨA các symbol định nghĩa trong file đó (class/method/function của
component .js). Hiện CONTAINS chỉ nối class→member (parent_symbol). Cần thêm: với node file-level
(lwc_component/aura_component/apex_class-as-file), tạo CONTAINS tới các symbol cùng `file_id`.
Query gợi ý:
```sql
-- file-level node = symbol đại diện file (lwc_component). Nối tới các symbol khác cùng file_id.
SELECT comp.id AS parent_id, sym.id AS child_id
FROM symbols comp
JOIN symbols sym ON sym.file_id = comp.file_id AND sym.id <> comp.id AND sym.project_id = comp.project_id
WHERE comp.project_id = ? AND comp.kind IN ('lwc_component','aura_component')
```
→ Mỗi LWC_COMPONENT nối tới class/method/property của file nó → hết cô lập.

### GAP 2b — IMPORTS giữa component/file (liên kết ngang)
LWC import module nhau, Apex gọi Apex. Nguồn import: `DependencyResolver.resolve()` chạy trong
runFullIndex. XÁC ĐỊNH output của nó lưu ở đâu (trước đây đọc `code_dependencies` — đã DROP ở 303!).
Nếu import data không được lưu nữa → cần lưu lại (bảng/relationships kind='imports') rồi tạo edge
IMPORTS giữa file node. Đây là liên kết ngang giữa các component (cụm xanh lá trong screenshot).

## GAP 3 — SF_FIELD (28) nối về SF_OBJECT cha
Field thuộc object. Nếu có quan hệ field→object (parent_symbol hoặc file_id), tạo CONTAINS
SF_OBJECT → SF_FIELD. Kiểm `sf_field` có parent_symbol/file_id trỏ về object không.

## Ưu tiên
- GAP 1 (inherits/implements đã resolve mà mất edge) — SỬA TRƯỚC, dữ liệu đã sẵn, chỉ là
  extractor/projection bỏ sót. Rẻ nhất, đúng nhất.
- GAP 2a (file→symbol CONTAINS) — nối 132 LWC_COMPONENT, rất hữu ích, thuần nội bộ.
- GAP 2b (imports ngang) — cho liên kết giữa component; cần khôi phục nguồn import.
- GAP 3 (field→object) — nhỏ, 28 node.

## DoD cập nhật
- [ ] INHERITS/IMPLEMENTS edge xuất hiện (từ 70+72 relationships đã resolve).
- [ ] LWC_COMPONENT / AURA_COMPONENT không còn cô lập (CONTAINS file→symbol).
- [ ] FUNCTION top-level nối được (qua file CONTAINS hoặc calls nội bộ).
- [ ] SF_FIELD nối về SF_OBJECT.
- [ ] Tỷ lệ node cô lập của SF giảm mạnh (kỳ vọng < 5%, chủ yếu là node thực sự độc lập).
- [ ] graph_edges touching SF ≥ ~1500; viewer: cụm LWC không còn tách rời.


---

# ROOT CAUSE THẬT (verify PG) — STALE SYMBOL IDs trong relationships

Sau P1/P2: graph vẫn chỉ CONTAINS 517 + CALLS 7; INHERITS/IMPLEMENTS = 0 edge; 232 node cô lập
(LWC_COMPONENT 132, CLASS 59, SF_FIELD 28, FUNCTION 11). Dry-run extractor MỚI trên DB hiện tại:

- MembershipEdgeStrategy → 517 CONTAINS, both-endpoints-in-graph = **517** ✅
- RelationshipsEdgeStrategy → 3553 edge (CALLS 3408, IMPLEMENTS 72, INHERITS 70, USES 3),
  both-endpoints-in-graph = **0** ❌

## Bằng chứng STALE IDs (inherits/implements, 142 rows, target đã resolve)
```
src_exists in symbols: 0   | tgt_exists in symbols: 0
id ranges:  symbols = 330137..331022 (886)   vs   relationships.source = 315801..331014
```
→ `relationships.source_symbol_id` / `target_symbol_id` trỏ tới symbol id CŨ (315801…) đã bị
xóa. Symbol hiện tại có id 330137–331022. Khi re-index, symbols bị DELETE+INSERT (id MỚI), nhưng
`relationships` giữ id CŨ → toàn bộ endpoint mồ côi → 0 khớp graph_nodes.

## Vì sao CONTAINS đúng mà relationships sai
- CONTAINS JOIN symbols↔symbols theo TÊN tại thời điểm chạy → id hiện tại → khớp.
- Relationships dùng `source_symbol_id`/`target_symbol_id` LƯU SẴN → id cũ → không khớp.

## Nguyên nhân cơ chế
Index theo từng file: `storeResults` DELETE+INSERT symbols của file (id mới) và DELETE+INSERT
relationships của file. Nhưng relationship từ file A trỏ tới symbol trong file B bằng id; khi
file B re-index (id đổi), id trong relationship của file A KHÔNG được cập nhật. `resolveTargets()`
chạy theo tên nhưng ghi lại target_symbol_id là id tại thời điểm đó — sẽ stale ở lần index sau.
→ relationships tích lũy id "hóa thạch" qua các lần index từng file.

## FIX (chọn hướng — khuyến nghị A)

### A (khuyến nghị) — RelationshipsEdgeStrategy resolve endpoint theo TÊN tại thời điểm build
Ngừng tin `source_symbol_id`/`target_symbol_id` đã lưu. Thay bằng JOIN theo tên (như CONTAINS)
để lấy id HIỆN TẠI:
```sql
SELECT src.id AS source_id, tgt.id AS target_id, r.kind
FROM relationships r
JOIN symbols src ON src.id = r.source_symbol_id AND src.project_id = r.project_id   -- source thường cùng file, còn tồn tại? nếu stale, join theo tên nguồn
-- Vấn đề: relationships không lưu source_symbol NAME, chỉ có id. Cần bổ sung source name khi ghi,
-- HOẶC rebuild relationships mỗi lần index để id luôn tươi.
```
Lưu ý: relationships hiện chỉ có `target_symbol` (tên đích) — KHÔNG có tên nguồn. Nên resolve
source theo tên không làm được trực tiếp. Do đó:

### A' — Ghi relationships với id TƯƠI + rebuild toàn project (không incremental theo file)
Khi index, sau khi TẤT CẢ symbols của project được ghi (id mới ổn định), rebuild `relationships`
target_symbol_id (và đảm bảo source_symbol_id trỏ id mới). Tức: `resolveTargets()` phải chạy SAU
khi toàn bộ symbols project được (re)ghi, và relationships của các file KHÁC cũng phải được
re-resolve — không chỉ file vừa đổi.

### B — Lưu tên cả hai đầu trong relationships (source_symbol + target_symbol)
Thêm cột `source_symbol` (tên nguồn) khi ghi relationships. Edge extractor JOIN symbols theo
(source_symbol name, target_symbol name) trong project → luôn dùng id hiện tại → không stale.
Đây là fix bền vững nhất (giống cách CONTAINS đã đúng). Cần: parser đã biết tên nguồn
(source symbol name) lúc emit relationship → thêm vào ExtractedRelationship + cột DB + storage.

### C — Full re-index sạch (xóa symbols + relationships của project rồi index lại 1 lượt)
Nếu stale do incremental per-file: một lần `DELETE FROM symbols/relationships WHERE project_id`
rồi index toàn bộ trong 1 transaction → id nhất quán. Kiểm: runFullIndex có xóa sạch project
trước khi index không, hay chỉ upsert từng file (gây lệch id)?

## Kiểm chứng nhanh cho người fix
- `SELECT COUNT(*) FROM relationships r WHERE r.project_id=SF AND NOT EXISTS
   (SELECT 1 FROM symbols s WHERE s.id=r.source_symbol_id)` → nếu > 0: source stale (đã xác nhận: 142/142 inherits+implements stale).
- Sau fix: both-endpoints-in-graph của RelationshipsEdgeStrategy > 0.

## Còn lại (GAP 2a) — LWC_COMPONENT vẫn cô lập (132)
Độc lập với stale-id: LWC_COMPONENT có parent_symbol=0, không là relationship source. CẦN
MembershipEdgeStrategy mở rộng: file-level node (lwc_component/aura_component) → CONTAINS tới
mọi symbol cùng file_id (xem GAP 2a ở trên). Chưa implement.

## DoD (thay DoD trước)
- [ ] RelationshipsEdgeStrategy tạo edge có CẢ 2 đầu là graph_node hiện tại (both-in-graph > 0).
- [ ] Không còn stale: relationships endpoint id khớp symbols hiện tại (hoặc resolve theo tên).
- [ ] INHERITS/IMPLEMENTS edge xuất hiện trong graph SF.
- [ ] LWC_COMPONENT/AURA_COMPONENT nối qua file→symbol CONTAINS (GAP 2a).
- [ ] Tỷ lệ node cô lập SF < 5% (hiện 26%).
- [ ] Test: re-index 2 lần → relationship id không stale; edge both-in-graph ổn định.


---

# ROOT CAUSE (verify PG): LWC_COMPONENT thiếu cạnh — component & code ở FILE KHÁC NHAU

`FileContainsSymbolStrategy` JOIN theo `s2.file_id = s1.file_id`, nhưng với LWC:
- `lwc_component` symbol nằm ở file **`.js-meta.xml`** (language `salesforce-meta`).
- `class`/`property`/`method` thật nằm ở file **`.js`** (language `javascript`).
→ Khác `file_id` → JOIN không khớp → **0 edge cho mọi LWC_COMPONENT**.

Bằng chứng (project 7b11cdc169de, thư mục recordEditFormStaticContact):
```
lwc_component recordEditFormStaticContact → lwc/recordEditFormStaticContact/recordEditFormStaticContact.js-meta.xml
class         RecordEditFormStaticContact → lwc/recordEditFormStaticContact/recordEditFormStaticContact.js
property      recordId/phoneField/...     → .../recordEditFormStaticContact.js
```
Mỗi `.js-meta.xml` chỉ chứa ĐÚNG 1 symbol (lwc_component). class/method/property (621 JS symbols /
135 files) sống ở `.js`. Vậy `file_id`-based membership không thể nối chúng.

## FIX: nối LWC_COMPONENT theo THƯ MỤC component (không theo file_id)

Một LWC component = 1 thư mục `lwc/<name>/` chứa cả `<name>.js-meta.xml`, `<name>.js`, `<name>.html`.
Nối `lwc_component` tới mọi symbol có `relative_path` cùng thư mục cha.

Thêm strategy (hoặc mở rộng FileContainsSymbolStrategy) — query gợi ý (PG + SQLite qua adapter):
```sql
-- dir cha = phần trước tên file. Nối lwc_component → symbol khác cùng thư mục.
SELECT comp.id AS parent_id, sym.id AS child_id
FROM symbols comp
JOIN files cf ON cf.id = comp.file_id
JOIN files sf ON sf.project_id = cf.project_id
JOIN symbols sym ON sym.file_id = sf.id AND sym.project_id = comp.project_id AND sym.id <> comp.id
WHERE comp.project_id = ?
  AND comp.kind IN ('lwc_component','aura_component')
  -- cùng thư mục: strip filename khỏi relative_path
  AND substr(sf.relative_path, 1, length(sf.relative_path) - length(replace... ))  -- xem note
```
Vì cắt chuỗi dir trong SQL khác nhau giữa PG/SQLite, thực hiện đơn giản hơn ở tầng TS:
1. Lấy tất cả `lwc_component`/`aura_component` với `relative_path` → tính `dir = path.dirname(rel)`.
2. Lấy tất cả symbol non-component với `relative_path` → nhóm theo `path.dirname`.
3. Với mỗi component, tạo CONTAINS tới mọi symbol cùng `dir` (trừ chính nó).
→ Mỗi LWC component nối tới class/property/method của nó (cùng thư mục) → hết cô lập 132 node.

Cách khác (chắc chắn, ít phụ thuộc path parsing): match theo TÊN component.
`lwc_component.name` = tên thư mục = tên class PascalCase hoặc camelCase. Nối component →
class có cùng thư mục. Nhưng match theo dir (path.dirname) là tổng quát và đúng nhất.

## Lưu ý
- Aura components cùng vấn đề (`.cmp` + controller `.js` khác file) → xử lý chung.
- Sau fix: kỳ vọng graph_edges touching SF tăng thêm ~ (132 component × vài symbol/component),
  132 LWC_COMPONENT không còn cô lập.

## DoD
- [ ] LWC_COMPONENT/AURA_COMPONENT nối tới symbol cùng thư mục (CONTAINS).
- [ ] 132 LWC_COMPONENT của SF không còn cô lập (verify: isolated LWC = 0).
- [ ] Không nối nhầm sang thư mục component khác (dir match chính xác).
- [ ] Test: seed component .js-meta.xml + class .js cùng dir → tạo CONTAINS.


---

# KẾT LUẬN: viewSource (aura_component) không có cạnh — HÀNH VI ĐÚNG, không phải bug

Verify PG (project 7b11cdc169de):
```
aura_component viewSource → force-app/main/default/components/viewSource.component-meta.xml (1 symbol duy nhất)
symbols under components/viewSource/  → []   (không có thư mục bundle)
files   under components/viewSource/  → []
relationships mentioning viewSource   → []   (không gọi ai, không ai gọi)
```

## Phân tích
- `viewSource` là **Visualforce/Aura component metadata ĐƠN FILE** (`.component-meta.xml`, ~6 dòng),
  nằm TRỰC TIẾP trong `components/` — KHÔNG có thư mục bundle `components/viewSource/` với `.cmp/.js/.css`.
- Không có symbol/file nào khác đi kèm để nối; không tham gia relationship nào.
- Spec LWC dir-based cũng KHÔNG áp dụng: `path.dirname` = `components/` (chứa nhiều component khác)
  → nối theo dir sẽ nối NHẦM các component không liên quan.

## Kết luận
Đây là thực thể ĐỘC LẬP hợp lệ trong dữ liệu (single-file metadata component). Node không có cạnh
là ĐÚNG — KHÔNG nên tạo edge giả để "làm đẹp" graph. Nguyên tắc "hầu hết entry có kết nối" đúng
với đa số, nhưng file metadata độc lập / config-only entity tự nhiên không có cạnh.

## Không cần fix
- KHÔNG ép nối viewSource. Sau khi fix LWC dir-based (GAP trên), số node cô lập còn lại sẽ là các
  thực thể độc lập hợp lệ như thế này (rất ít) — chấp nhận được.
- Chỉ coi là bug NẾU thực tế component có bundle `.cmp/.js` mà indexer bỏ sót. Ở đây thư mục bundle
  không tồn tại → không phải bug indexing.
