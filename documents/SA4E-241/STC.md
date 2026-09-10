# System Test Cases (STC)

## SDLC-Agents-4-Enterprise / Code Intelligence Extension — SA4E-241: Incremental Indexing bằng Checksum

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-241 |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-04-30 |
| Related STP | STP-v1-SA4E-241.docx |
| Test frameworks | Vitest, fast-check (PBT), Hono `app.request()`, Playwright |
| Tổng số case | PBT×6, UT×35, IT×27, E2E-API×8, E2E-UI×2, SIT×3 = **81 test cases** |

---

## Cấu trúc mỗi Test Case

Mỗi case gồm: **ID · Level · Trace (BR/IC/SEC/TC) · Mục tiêu · Preconditions · Test Data · Steps · Expected Result**.

Ký hiệu Level: **PBT** (property-based), **UT** (unit), **IT** (integration), **API** (E2E-API), **UI** (E2E-UI), **SIT** (system integration).

---

## 0. Test Fixtures & Vectors (dùng chung)

> Các vector expected được sinh **độc lập** với code under test (TD-1). git-blob vector từ `git hash-object` thật (TD-2).

### 0.1 Pega checksum vectors — `fixtures/pega-checksum-vectors.csv`

Payload = `trim(pzInsKey) + "|" + trim(pxUpdateDateTime ?? "") + "|" + trim(pxSaveDateTime ?? "")`; `checksum = sha256_hex(utf8(payload))` (lowercase).

```csv
id,pzInsKey,pxUpdateDateTime,pxSaveDateTime,expected_payload,expected_sha256
V1,RULE-A,20260430T101500.000 GMT,20260430T101500.000 GMT,RULE-A|20260430T101500.000 GMT|20260430T101500.000 GMT,<sha256(V1) tính tay>
V2,RULE-A,,20260430T101500.000 GMT,RULE-A||20260430T101500.000 GMT,<sha256(V2)>
V3, RULE-A , 20260430T101500.000 GMT ,,RULE-A|20260430T101500.000 GMT|,<sha256(V3)>
V4,RULE-Ç-Ⅴ,20260430T101500.000 GMT,20260430T101500.000 GMT,RULE-Ç-Ⅴ|20260430T101500.000 GMT|20260430T101500.000 GMT,<sha256(V4 utf8)>
V5,RULE-A,x|y,z,RULE-A|x|y|z,<sha256(V5)>
```

> ⛔ Cột `expected_sha256` sinh bằng script độc lập, ví dụ:
> `node -e "const c=require('crypto');console.log(c.createHash('sha256').update('RULE-A|20260430T101500.000 GMT|20260430T101500.000 GMT','utf-8').digest('hex'))"`
> Giá trị này ghi cứng vào CSV; test KHÔNG gọi `computePegaChecksum` để sinh expected (tránh tautology).

### 0.2 git-blob vectors — `fixtures/git-blob-vectors.csv`

`git_blob = sha1("blob " + byteLength + "\0" + content)`; expected lấy từ `git hash-object <file>`.

```csv
id,relativePath,content,expected_git_sha1
G1,src/a.ts,"export const x = 1;\n",<git hash-object src/a.ts>
G2,src/empty.ts,"",<git hash-object của file rỗng = e69de29...>
G3,src/utf8.ts,"// chào ✅\n",<git hash-object>
G4,docs/big.md,"<10KB nội dung>",<git hash-object>
```

> Setup script (test bootstrap) tạo file thật rồi chạy `git hash-object` để điền `expected_git_sha1`. File rỗng có hash cố định `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` — dùng làm sanity vector.

### 0.3 Fallback vectors — `fixtures/file-fallback-vectors.csv`

`fallback = sha256(relativePath + "\0" + content)` (relativePath chuẩn hoá `/`).

```csv
id,relativePath,content,expected_sha256
F1,src/a.ts,"export const x = 1;\n",<sha256(path+NUL+content) tính tay>
F2,src/empty.ts,"",<sha256(path+NUL+"")>
F3,src/utf8.ts,"// chào ✅\n",<sha256 utf8>
```

### 0.4 Multi-tenant fixture — `fixtures/multi-tenant.json`

```jsonc
{
  "PegaCollProj": { "existing": ["aaaa...(64hex)", "bbbb...(64hex)"] },
  "OtherProj":    { "existing": ["cccc...(64hex)", "aaaa...(64hex)"] }  // "aaaa..." trùng giá trị với PegaCollProj
}
```

> Checksum `aaaa...` tồn tại ở CẢ 2 project → dùng để chứng minh isolation: query PegaCollProj chỉ trả checksum của PegaCollProj (SEC-01c/SEC-10).

---
## 1. Property-Based Tests (PBT) — Checksum determinism & normalization (fast-check)

> Đây là nhóm **quan trọng nhất**. PBT chứng minh **tính chất** đúng với **mọi** input (hàng nghìn case ngẫu nhiên), không chỉ vài ví dụ. File: `extension/src/code-intel/checksum/__tests__/checksum.pbt.test.ts`. `fc.assert(fc.property(...), { numRuns: 1000 })`.

---

### PBT-01 — Determinism: cùng input → cùng checksum
- **Level:** PBT · **Trace:** BR-04, IC-02
- **Mục tiêu:** `computePegaChecksum` là hàm thuần deterministic — gọi 2 lần cùng input luôn ra cùng kết quả.
- **Preconditions:** `PegaRuleChecksumStrategy` implement xong.
- **Test Data:** `fc.record({ pzInsKey: fc.string(), pxUpdateDateTime: fc.option(fc.string()), pxSaveDateTime: fc.option(fc.string()) })`, numRuns ≥ 1000.
- **Steps:**
  1. Với mỗi input sinh ngẫu nhiên, gọi `computePegaChecksum(input)` hai lần (h1, h2).
  2. Gọi lại sau khi clone sâu input.
- **Expected Result:** `h1 === h2` cho mọi case; kết quả là chuỗi hex lowercase độ dài 64; không throw.

### PBT-02 — Normalization invariance: whitespace bao quanh không đổi kết quả
- **Level:** PBT · **Trace:** BR-04 (trim)
- **Mục tiêu:** Thêm khoảng trắng đầu/cuối mỗi field KHÔNG làm đổi checksum (vì trim).
- **Test Data:** input ngẫu nhiên + biến thể `"  " + field + "  "` (spaces/tabs/newlines) cho từng field.
- **Steps:**
  1. `base = computePegaChecksum(input)`.
  2. `padded = computePegaChecksum({ pzInsKey: pad(input.pzInsKey), pxUpdateDateTime: pad(...), pxSaveDateTime: pad(...) })`.
- **Expected Result:** `base === padded` cho mọi case (chỉ khoảng trắng bao quanh; nội dung giữa không đổi).

### PBT-03 — Null vs empty-string tương đương
- **Level:** PBT · **Trace:** BR-04 (null→"")
- **Mục tiêu:** `null`/`undefined` và `""` cho `pxUpdateDateTime`/`pxSaveDateTime` cho cùng checksum.
- **Test Data:** input với field optional = một trong `{null, undefined, ""}` (fc.constantFrom).
- **Steps:** Tính checksum cho biến thể null, undefined, empty của cùng field khác giữ nguyên.
- **Expected Result:** 3 biến thể (null/undefined/"") cho **cùng** checksum. (Chứng minh `?? ""` + trim đồng nhất.)

### PBT-04 — INV-1: CSV path ≡ nội suy path (dùng chung computePegaChecksum)
- **Level:** PBT · **Trace:** INV-1, IC-02, IC-B1
- **Mục tiêu:** Với cùng rule, checksum tính từ "row CSV" (Nguồn A) và từ "rule JSON" (Nguồn B) **luôn bằng nhau**.
- **Test Data:** sinh ngẫu nhiên 3 field; dựng đồng thời `csvRow = {pzInsKey, pxUpdateDateTime, pxSaveDateTime}` và `ruleJson = { pzInsKey, pxUpdateDateTime, pxSaveDateTime, ...extraFields }` (extra fields ngẫu nhiên KHÔNG dùng trong công thức).
- **Steps:**
  1. `hA = PegaRuleChecksumStrategy.compute(mapCsvRow(csvRow))`.
  2. `hB = PegaRuleChecksumStrategy.compute(mapRuleJson(ruleJson))`.
- **Expected Result:** `hA === hB` cho mọi case, kể cả khi `ruleJson` có nhiều field thừa (chỉ 3 field vào công thức).

### PBT-05 — Uniqueness-in-project: rule khác nhau → checksum khác
- **Level:** PBT · **Trace:** NT-3 (uniqueness), Story 3
- **Mục tiêu:** 2 rule khác nhau ở ≥1 trong 3 field → checksum khác (kể cả data rule cùng pzInsKey, khác save-time). Không đảm bảo tuyệt đối chống va chạm sha256 nhưng phải khác khi input khác (bijective-payload check).
- **Test Data:** sinh cặp `(a, b)` với ràng buộc `a ≠ b` ở ít nhất 1 field (fc.pre lọc case trùng payload sau chuẩn hoá).
- **Steps:**
  1. Tính `payloadA`, `payloadB` (chuẩn hoá). `fc.pre(payloadA !== payloadB)`.
  2. `hA = compute(a)`, `hB = compute(b)`.
- **Expected Result:** `hA !== hB` cho mọi case có payload chuẩn hoá khác nhau. Đặc biệt cặp cùng `pzInsKey` khác `pxSaveDateTime` → khác checksum (bắt data rule).

### PBT-06 — DeltaClassifier totality & partition
- **Level:** PBT · **Trace:** IC-05, BR-05/06
- **Mục tiêu:** Với mọi tập candidates + tập existing, `classify` trả về `skip ∪ fetch = candidates` (không mất/không nhân đôi), `skip ∩ fetch = ∅`, `skip = {c | c.checksum ∈ existing}`, `fetch = phần còn lại`.
- **Test Data:** `fc.array(candidate)` (checksum ngẫu nhiên hex) + `existing = Set` là tập con ngẫu nhiên các checksum đó + checksum lạ.
- **Steps:**
  1. `res = classifier.classify(candidates, existing)`.
  2. Kiểm partition: length skip+fetch = candidates.length; không phần tử trùng.
  3. Kiểm predicate: mọi phần tử skip có checksum ∈ existing; mọi phần tử fetch có checksum ∉ existing.
- **Expected Result:** Bất biến partition + predicate đúng cho mọi input (totality — không candidate nào bị bỏ rơi).

---
## 2. Unit Tests (UT) — Strategy / Factory / Classifier / Parser / Guards (Vitest)

> Hàm/lớp cô lập, mock I/O. Vector expected độc lập (fixtures §0).

### 2.1 Checksum công thức Pega (UT-01..UT-12)

### UT-01 — Checksum Pega khớp vector base case (V1)
- **Level:** UT · **Trace:** BR-04, IC-02
- **Mục tiêu:** `computePegaChecksum` cho V1 == expected vector tính tay.
- **Preconditions:** `pega-checksum-vectors.csv` loaded.
- **Test Data:** V1 (`RULE-A`, update=save=`20260430T101500.000 GMT`).
- **Steps:** `const h = computePegaChecksum({pzInsKey:'RULE-A', pxUpdateDateTime:'20260430T101500.000 GMT', pxSaveDateTime:'20260430T101500.000 GMT'})`.
- **Expected Result:** `h === V1.expected_sha256`; độ dài 64; toàn lowercase hex.

### UT-02 — Separator đúng là `|` và thứ tự pzInsKey|update|save
- **Level:** UT · **Trace:** BR-04
- **Mục tiêu:** Payload dựng đúng thứ tự + separator `|`.
- **Test Data:** input đã biết payload → so checksum với `sha256_hex("RULE-A|U|S")` tính tay.
- **Steps:** So sánh với vector; đồng thời assert đổi thứ tự (save trước update) cho checksum KHÁC.
- **Expected Result:** Khớp thứ tự đúng; hoán vị field → checksum khác (chứng minh thứ tự cố định).

### UT-03 — Field đúng `pxUpdateDateTime` (prefix px), KHÔNG `pyUpdateDateTime`
- **Level:** UT · **Trace:** BR-04, Risk 5.1 BRD
- **Mục tiêu:** Chống lỗi field-name (px vs py).
- **Test Data:** rule JSON có cả `pxUpdateDateTime` và `pyUpdateDateTime` khác giá trị.
- **Steps:** map rule JSON → input; tính checksum; so với vector dùng `pxUpdateDateTime`.
- **Expected Result:** Checksum dùng giá trị `pxUpdateDateTime`; đổi `pyUpdateDateTime` KHÔNG ảnh hưởng checksum.

### UT-04 — computePegaChecksum dùng chung (một hàm, không nhân bản)
- **Level:** UT · **Trace:** IC-02
- **Mục tiêu:** Strategy A và nhánh B gọi cùng một hàm `computePegaChecksum` (không có bản copy khác).
- **Test Data:** spy/stub `computePegaChecksum`.
- **Steps:** Gọi `PegaRuleChecksumStrategy.compute(...)`; assert internal delegate tới `computePegaChecksum` (via import reference / behavior identity với nhánh nội suy).
- **Expected Result:** Cùng hàm dùng cho cả 2 nhánh (behavior identical — verify bằng output identity trên bộ vector).

### UT-05 — Nội suy: compute từ ruleJson == checksum CSV (INV-1 ví dụ cụ thể)
- **Level:** UT · **Trace:** INV-1, IC-B1
- **Mục tiêu:** Cùng rule, map từ JSON và map từ CSV row cho cùng checksum.
- **Test Data:** V1 dưới dạng CSV row và dạng ruleJson (thêm field thừa `pyLabel`, `pxObjClass`).
- **Steps:** `hCsv = compute(fromCsv(V1))`; `hJson = compute(fromJson(V1json))`.
- **Expected Result:** `hCsv === hJson === V1.expected_sha256`.

### UT-06 — Normalization: trim từng field (V3)
- **Level:** UT · **Trace:** BR-04 (trim)
- **Test Data:** V3 (` RULE-A `, ` 2026... `, empty).
- **Steps:** compute(V3).
- **Expected Result:** Khớp `V3.expected_sha256` (bằng checksum của `RULE-A|2026...|`).

### UT-07 — Normalization: null/undefined/empty → "" (V2)
- **Level:** UT · **Trace:** BR-04 (null→"")
- **Test Data:** V2 với `pxUpdateDateTime` lần lượt = null, undefined, "".
- **Steps:** compute cho 3 biến thể.
- **Expected Result:** 3 biến thể cho cùng checksum == `V2.expected_sha256`.

### UT-08 — Encoding UTF-8 (V4)
- **Level:** UT · **Trace:** BR-04 (UTF-8)
- **Test Data:** V4 (`RULE-Ç-Ⅴ` + ký tự UTF-8 nhiều byte).
- **Steps:** compute(V4); assert dùng `update(payload, 'utf-8')`.
- **Expected Result:** Khớp `V4.expected_sha256` (byte UTF-8, không phải latin1/ascii).

### UT-09 — Verify Cách B: cột CSV khớp → OK; lệch → cảnh báo E-03, dùng giá trị extension
- **Level:** UT · **Trace:** IC-A2, E-03
- **Mục tiêu:** Extension verify cột `checksum` CSV bằng cách tự tính; lệch → warning + dùng giá trị extension làm nguồn sự thật.
- **Test Data:** (a) row có cột checksum == computed; (b) row có cột checksum SAI (khác computed).
- **Steps:** parse row → verify; capture warning channel.
- **Expected Result:** (a) không warning, dùng computed; (b) phát warning E-03 (kèm pzInsKey), giá trị dùng downstream = computed (NT-1), KHÔNG dùng cột CSV sai.

### UT-10 — Cột checksum CSV THIẾU → extension tự tính (E-02, không crash)
- **Level:** UT · **Trace:** IC-A3, E-02
- **Test Data:** CSV row không có cột `checksum` (header name-based).
- **Steps:** parse + compute từ 3 field.
- **Expected Result:** Không throw; checksum tính được từ 3 field; (tùy chọn) warning E-02 ghi nhận thiếu cột.

### UT-11 — Cột checksum CSV SAI ĐỊNH DẠNG → extension tự tính
- **Level:** UT · **Trace:** IC-A3, E-02
- **Test Data:** row có `checksum = "NOT_HEX_@@"`.
- **Steps:** parse + verify.
- **Expected Result:** Bỏ qua giá trị sai; dùng computed; warning ghi nhận; không crash.

### UT-12 — Uniqueness ví dụ: data rule cùng pzInsKey khác save-time → checksum khác
- **Level:** UT · **Trace:** NT-3, Story 3, TC-04
- **Test Data:** `pega-datarule-vectors.csv` (2 rule cùng `pzInsKey=DATA-X`, khác `pxSaveDateTime`).
- **Steps:** compute cả 2.
- **Expected Result:** 2 checksum khác nhau (chứng minh bắt được thay đổi data rule).

### 2.2 git-blob & fallback (UT-13..UT-17)

### UT-13 — git-blob checksum khớp `git hash-object` (vector G1/G3/G4)
- **Level:** UT · **Trace:** IC-C1
- **Mục tiêu:** `GitBlobChecksumStrategy.compute` == `git hash-object <file>` thật.
- **Preconditions:** setup script đã điền `expected_git_sha1` từ CLI git.
- **Test Data:** `git-blob-vectors.csv` G1 (ascii), G3 (utf8), G4 (10KB).
- **Steps:** với mỗi vector, `compute({relativePath, content})`.
- **Expected Result:** Khớp `expected_git_sha1` (40 hex lowercase) cho toàn bộ vector.

### UT-14 — git-blob file rỗng = hash cố định biết trước
- **Level:** UT · **Trace:** IC-C1
- **Test Data:** G2 (content "").
- **Steps:** compute; so với `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`.
- **Expected Result:** Khớp hash git của blob rỗng (header `blob 0\0`).

### UT-15 — Fallback sha256(path+NUL+content) khớp vector (F1)
- **Level:** UT · **Trace:** IC-C2
- **Test Data:** `file-fallback-vectors.csv` F1.
- **Steps:** `FileContentFallbackStrategy.compute({relativePath:'src/a.ts', content:...})`.
- **Expected Result:** Khớp `F1.expected_sha256` (path + byte NUL 0x00 + content, UTF-8).

### UT-16 — Fallback: path khác → checksum khác dù content giống
- **Level:** UT · **Trace:** IC-C2 (path chống đụng nội dung)
- **Test Data:** 2 file cùng content, khác `relativePath`.
- **Steps:** compute cả 2.
- **Expected Result:** 2 checksum khác nhau (path đưa vào payload → tránh collision nội dung giống nhau).

### UT-17 — Nội suy Pega không cần fail-safe thiếu field (3 field luôn có)
- **Level:** UT · **Trace:** IC-B2
- **Test Data:** ruleJson đầy đủ 3 field cơ bản.
- **Steps:** compute; đồng thời case ruleJson thiếu 1 field → chứng minh nhánh nội suy không có logic "skip nếu thiếu" (dùng `?? ""` chuẩn).
- **Expected Result:** compute thành công; thiếu field xử lý qua null→"" (không nhánh fail-safe riêng, đúng thiết kế).

### 2.3 Factory (UT-18..UT-19)

### UT-18 — Factory.forPega() trả PegaRuleChecksumStrategy
- **Level:** UT · **Trace:** IC-01
- **Steps:** `const s = ChecksumStrategyFactory.forPega()`.
- **Expected Result:** `s instanceof PegaRuleChecksumStrategy`; `s.sourceKind === 'pega-rule'`.

### UT-19 — Factory.forFile(kind, hasGit) chọn đúng impl (OCP)
- **Level:** UT · **Trace:** IC-01
- **Test Data:** (code,true)→GitBlob; (code,false)→Fallback; (document,true)→GitBlob; (document,false)→Fallback.
- **Steps:** gọi factory 4 tổ hợp.
- **Expected Result:** `hasGit=true` → `GitBlobChecksumStrategy` với `sourceKind` đúng; `hasGit=false` → `FileContentFallbackStrategy`.

### 2.4 Delta / Comparer / grep-behavior (UT-20..UT-27)

### UT-20 — DeltaClassifier: checksum == existing → skip
- **Level:** UT · **Trace:** BR-02, IC-05
- **Test Data:** candidate checksum ∈ existing set.
- **Steps:** classify.
- **Expected Result:** candidate nằm trong `skip`, không trong `fetch`.

### UT-21 — DeltaClassifier: data rule đổi save-time → checksum mới ∉ existing → fetch
- **Level:** UT · **Trace:** BR-03, TC-04
- **Test Data:** existing chứa checksum cũ của DATA-X; candidate mang checksum mới (save-time đổi).
- **Steps:** classify.
- **Expected Result:** candidate ∈ `fetch` (re-index) — dù `pzInsKey` không đổi.

### UT-22 — Removed detection: state có, CSV không → removed
- **Level:** UT · **Trace:** BR-11, TC-06
- **Mục tiêu:** Hàm phân loại removed (checksum/insKey trong state cũ nhưng không trong candidates hiện tại).
- **Test Data:** state = {A,B,C}; candidates hiện tại = {A,B}.
- **Steps:** gọi hàm tính removed.
- **Expected Result:** removed = {C}; skip/fetch không chứa C.

### UT-23 — skip = existing (đúng định nghĩa NT-4)
- **Level:** UT · **Trace:** IC-05
- **Test Data:** existing = {h1,h2}; candidates = {h1,h2,h3}.
- **Steps:** classify.
- **Expected Result:** skip = {h1,h2} (== existing giao candidates); fetch = {h3}.

### UT-24 — fetch = checksums − existing
- **Level:** UT · **Trace:** IC-05
- **Test Data:** existing = {h1}; candidates = {h1,h2,h3}.
- **Steps:** classify.
- **Expected Result:** fetch = {h2,h3}.

### UT-25 — Chỉ so bằng checksum, KHÔNG pzInsKey/fqn (NT-3/IC-06)
- **Level:** UT · **Trace:** IC-06, NT-3
- **Mục tiêu:** Classify chỉ dùng field `checksum` để so; `ref` (insKey/path) không tham gia so.
- **Test Data:** 2 candidate cùng `checksum` nhưng khác `ref`; 2 candidate khác `checksum` nhưng cùng `ref`.
- **Steps:** classify với existing chứa checksum đó.
- **Expected Result:** Kết quả skip/fetch chỉ phụ thuộc `checksum` (candidate cùng checksum → cùng phân loại bất kể ref). (Grep bổ trợ: không có `.pzInsKey ===`/`.signature ===` trong DeltaClassifier.)

### UT-26 — Backend KHÔNG tính checksum (IC-04) — behavior/grep
- **Level:** UT · **Trace:** IC-04, NT-4
- **Mục tiêu:** Route bulk-check + ChecksumStore chỉ query content_hash, không gọi `createHash`.
- **Test Data:** source của `pega-api.ts` route bulk-check + `ChecksumStore.ts`.
- **Steps:** (a) grep: không có `crypto.createHash`/`hash-object` trong file route/store; (b) behavior: mock DB, gọi route → chỉ gọi `selectExistingHashes`, không có bước tính hash.
- **Expected Result:** Không tồn tại lời gọi tính checksum ở backend delta path.

### UT-27 — KHÔNG convert hash cũ→mới (IC-M2) — behavior/grep
- **Level:** UT · **Trace:** IC-M2
- **Mục tiêu:** Không có code map/convert content_hash cũ (full-JSON sha256) sang checksum mới.
- **Test Data:** source migration + PegaSymbolSync.
- **Steps:** grep tìm hàm convert/migrate-hash; behavior: migration path chỉ đánh dấu "cũ không khớp → delta".
- **Expected Result:** Không có converter; state cũ tự nhiên vào delta (full re-index 1 lần).

### 2.5 Security guards (UT-28..UT-35)

### UT-28 — MAX_TOTAL_SIZE: x-file-size vượt ngưỡng → abort trước tải
- **Level:** UT · **Trace:** SEC-05a
- **Test Data:** header `x-file-size = 300MB` (> MAX_TOTAL_SIZE 200MB).
- **Steps:** gọi downloader với response đầu mang x-file-size vượt ngưỡng.
- **Expected Result:** Throw/abort ngay TRƯỚC khi tải chunk; báo user; KHÔNG ghi checksum/state.

### UT-29 — Zip-bomb: uncompressed size / entry count vượt ngưỡng → abort
- **Level:** UT · **Trace:** SEC-05b
- **Test Data:** zip fixture với tổng uncompressed > MAX_UNCOMPRESSED_SIZE hoặc entries > MAX_ZIP_ENTRIES (đo thực tế khi stream, không tin header).
- **Steps:** unzip stream → cộng dồn uncompressed.
- **Expected Result:** Abort khi vượt trần; không giải nén tiếp; báo user.

### UT-30 — Zip-Slip: entry chứa `../` → reject
- **Level:** UT · **Trace:** SEC-06a
- **Test Data:** `zip-slip-entries.json` entry `../../etc/passwd`.
- **Steps:** `isContained(dest, entryName)`.
- **Expected Result:** `isContained` = false → entry bị reject, không extract.

### UT-31 — Zip-Slip: entry absolute path / symlink → reject
- **Level:** UT · **Trace:** SEC-06a
- **Test Data:** entry `/absolute/evil`, entry symlink.
- **Steps:** kiểm reject rule (absolute/symlink/`..`).
- **Expected Result:** Cả absolute và symlink đều bị reject.

### UT-32 — File-scan: file ngoài workspaceRoot → skip (containment)
- **Level:** UT · **Trace:** SEC-06b
- **Test Data:** relativePath resolve ra ngoài workspaceRoot (`../outside.ts`).
- **Steps:** canonicalize + `isContained(workspaceRoot, relativePath)` trước khi đọc.
- **Expected Result:** `isContained` = false → skip đọc file + báo; không đọc nội dung ngoài workspace.

### UT-33 — Encoded-slash insKey: pzInsKey chứa `/` → fetch dùng fallback encode `%2F`/query API
- **Level:** UT · **Trace:** OI-03
- **Test Data:** `pzInsKey = "RULE-OBJ-ACTIVITY DATA-ADMIN/OPS !SOMETHING"` (chứa `/` + space).
- **Steps:** build fetch request; assert dùng query-param/encode thay path segment thô.
- **Expected Result:** insKey được encode đúng (`%2F`) hoặc chuyển query API; không tạo path segment thô gây 404/normalize.

### UT-34 — Timestamp racy (OI-06): 2 save cùng đơn vị thời gian — ghi nhận giới hạn
- **Level:** UT · **Trace:** TC-13, OI-06
- **Mục tiêu:** Nếu `pxUpdateDateTime` và `pxSaveDateTime` KHÔNG đổi (cùng resolution) → checksum không đổi (giới hạn đã biết); nếu bất kỳ trong 2 đổi → checksum đổi.
- **Test Data:** (a) 2 rule cùng cả 3 field → cùng checksum; (b) chênh 1ms ở pxSaveDateTime → khác checksum.
- **Steps:** compute cả 2 case.
- **Expected Result:** (a) cùng checksum (ghi nhận giới hạn racy — documented, không phải bug); (b) khác checksum (bắt được thay đổi có timestamp phân giải).

### UT-35 — Resumable download decode: base64 concat → decode → verify size + magic
- **Level:** UT · **Trace:** §13.1 FSD, SEC-05
- **Mục tiêu:** Decode đúng luồng base64 (không content-range; dùng x-file-size), verify toàn vẹn.
- **Test Data:** mock chuỗi base64 chunk (1 MiB theo base64 length), x-file-size khớp; magic `PK\x03\x04`.
- **Steps:** concat b64 → `base64Decode` → assert `zipBuf.length === x-file-size` → assert magic bytes.
- **Expected Result:** Decode đúng; size khớp x-file-size; magic đúng; offset tăng theo base64 length (không bytes ZIP). Mismatch size → throw E-01.

---
## 3. Integration Tests (IT) — bulk-check contract, delta, migration, regression, isolation (Vitest + Hono app.request() + SQLite in-memory)

> ⛔ DB **thật** (SQLite `:memory:`), Hono **app thật**, migration chạy thật. KHÔNG mock ChecksumStore/DB. Pega HTTP dùng fixture/mock.

### 3.1 Checksum cross-path & verify (IT-01..IT-02)

### IT-01 — INV-1 end-to-end: CSV row và rule JSON của cùng rule → cùng checksum → cùng phân loại
- **Level:** IT · **Trace:** INV-1, IC-B1
- **Mục tiêu:** Xác nhận qua pipeline thật (parser CSV + strategy + classifier) rằng Nguồn A và Nguồn B của cùng rule cho cùng checksum và cùng quyết định skip/fetch.
- **Preconditions:** parser + strategy + classifier wired.
- **Test Data:** `pega-rules-baseline.csv` (1 rule) + rule JSON tương ứng.
- **Steps:**
  1. Parse CSV → candidate A (checksum cA).
  2. Map rule JSON (nội suy) → candidate B (checksum cB).
  3. Cho existing = {cA}; classify B.
- **Expected Result:** cA === cB; candidate B → skip (vì cB ∈ existing). Chứng minh incremental đúng khi rule đến qua 2 đường.

### IT-02 — Verify Cách B qua parser thật: lệch cột CSV → E-03 warning + dùng computed
- **Level:** IT · **Trace:** IC-A2, E-03
- **Test Data:** CSV có 1 row cột `checksum` sai (≠ computed).
- **Steps:** chạy parse+verify pipeline; capture output channel.
- **Expected Result:** Warning E-03 cho row đó; downstream dùng computed; các row đúng không warning.

### 3.2 bulk-check contract & delta (IT-03..IT-13)

### IT-03 — No-change run: skip ~100% (TC-02/IC-M1)
- **Level:** IT · **Trace:** Story 1, TC-02, IC-M1, BR-18
- **Mục tiêu:** DB đã có toàn bộ checksum → lần chạy 2 không fetch rule nào.
- **Preconditions:** seed `files.content_hash` với toàn bộ checksum của baseline; project = PegaCollProj (identity).
- **Test Data:** `pega-rules-baseline.csv` (~20 rule) đã index.
- **Steps:**
  1. StateComparer.compare(projectId, candidates) → gọi bulk-check thật.
  2. Đếm skip/fetch.
- **Expected Result:** skip = 100% (tất cả), fetch = 0; không có lời gọi fetch-rule; report reindexed=0.

### IT-04 — Idempotency: chạy 2 lần liên tiếp no-change → kết quả DB không đổi
- **Level:** IT · **Trace:** BR-18
- **Steps:** chạy incremental 2 lần trên cùng data; so snapshot `files`/`symbols`.
- **Expected Result:** DB identical sau lần 1 và lần 2; reindexed=0 lần 2.

### IT-05 — Rule đổi save-time → re-index (TC-03)
- **Level:** IT · **Trace:** BR-03, TC-03
- **Test Data:** baseline đã index; `pega-rules-changed.csv` (1 rule đổi pxSaveDateTime).
- **Steps:** classify → chỉ rule đổi vào fetch → ingest → content_hash cập nhật.
- **Expected Result:** Đúng 1 rule reindexed; 19 skip; `content_hash` của rule đó = checksum mới.

### IT-06 — Data rule đổi (pzInsKey không đổi, save-time đổi) → re-index (TC-04)
- **Level:** IT · **Trace:** BR-03, TC-04, Story 3
- **Test Data:** `pega-datarule-vectors.csv` (DATA-X cũ đã index; DATA-X mới save-time đổi).
- **Steps:** classify DATA-X mới với existing chứa checksum cũ.
- **Expected Result:** DATA-X mới ∈ fetch → re-index; content_hash cập nhật checksum mới.

### IT-07 — Rule mới → fetch + index (TC-05)
- **Level:** IT · **Trace:** TC-05
- **Test Data:** CSV thêm 1 rule chưa có trong DB.
- **Steps:** classify → fetch → ingest.
- **Expected Result:** Rule mới ∈ fetch; sau ingest có bản ghi + content_hash mới; các rule cũ skip.

### IT-08 — Rule removed → dọn state + báo (TC-06/E-07/BR-11)
- **Level:** IT · **Trace:** BR-11, TC-06, E-07
- **Test Data:** DB có rule C; CSV không còn C.
- **Steps:** phát hiện removed → cleanup → report.
- **Expected Result:** C bị dọn khỏi index/state (scope theo identity); report "removed = 1"; các rule khác nguyên vẹn.

### IT-09 — Backend behavior: bulk-check chỉ query, không tính checksum (IC-04)
- **Level:** IT · **Trace:** IC-04, NT-4
- **Steps:** gửi bulk-check qua app thật; theo dõi (spy) không có bước hash; chỉ `SELECT content_hash ... = ANY(...)`.
- **Expected Result:** existing đúng, không có tính checksum server-side.

### IT-10 — bulk-check: N checksum (M đã có) → existing = M (IC-03)
- **Level:** IT · **Trace:** IC-03
- **Preconditions:** DB có sẵn 2 checksum (h1,h2) trong PegaCollProj.
- **Test Data:** gửi checksums=[h1,h2,h3] (h3 mới).
- **Steps:** POST /pega/rulecatalog/bulk-check với identity PegaCollProj.
- **Expected Result:** `existing = [h1,h2]` (đúng M=2); h3 không có → client fetch h3.

### IT-11 — Sau index: content_hash = checksum (mọi nguồn) (BR-07/10)
- **Level:** IT · **Trace:** BR-07, BR-10
- **Steps:** ingest rule delta với checksum X → query DB.
- **Expected Result:** `files.content_hash == X` cho item vừa ingest; cùng cột dùng cho Pega + non-Pega.

### IT-12 — Index idx_files_project_content_hash được dùng (IC-07)
- **Level:** IT · **Trace:** IC-07
- **Preconditions:** chạy trên Postgres test (hoặc SQLite EXPLAIN QUERY PLAN).
- **Steps:** EXPLAIN bulk-check query `content_hash = ANY($2) AND project_id=$1`.
- **Expected Result:** Query plan dùng index `idx_files_project_content_hash` (không full scan).

### IT-13 — Report tổng hợp skipped/reindexed/removed/error đúng số (BR-12)
- **Level:** IT · **Trace:** BR-12
- **Test Data:** mix: 2 mới, 1 đổi, 1 removed, 16 unchanged, 1 fetch lỗi.
- **Steps:** chạy pipeline → đọc report object.
- **Expected Result:** skipped=16, reindexed=3, removed=1, error=1 (khớp thực tế).

### 3.3 Migration / Regression (IT-14..IT-17)

### IT-14 — Full re-index 1 lần sau migration; lần 2 skip ~100% (IC-M1)
- **Level:** IT · **Trace:** IC-M1, §5.5
- **Preconditions:** DB seed `content_hash` = **hash cũ** (sha256 full-JSON) khác công thức mới.
- **Steps:**
  1. Lần 1 sau migration: checksum mới ∉ existing (vì DB giữ hash cũ) → tất cả vào fetch → re-index → ghi đè content_hash = checksum mới.
  2. Lần 2: no-change → skip ~100%.
- **Expected Result:** Lần 1 reindexed = tất cả; lần 2 skip = 100%, reindexed=0. Mọi ghi scope theo identityProjectId.

### IT-15 — Non-Pega regression: HashCache cũ → git-blob mới; file không đổi sau migration → skip (IC-C3)
- **Level:** IT · **Trace:** IC-C3, BR-17, TC-12, Story 4
- **Preconditions:** DB seed content_hash file non-Pega = sha256 content thuần (cũ).
- **Steps:**
  1. Lần 1 sau migration: git-blob mới ∉ existing → re-index file (giá trị đổi).
  2. Lần 2: file không đổi → git-blob giống → skip.
- **Expected Result:** Lần 1 file re-index 1 lần; lần 2 skip; hành vi index (symbol) không đổi so với trước.

### IT-16 — Non-Pega: file đổi nội dung → re-index (IC-C3)
- **Level:** IT · **Trace:** IC-C3, BR-17
- **Steps:** sau khi ổn định, sửa nội dung file → git-blob đổi → classify.
- **Expected Result:** File đổi ∈ fetch → re-index; content_hash cập nhật.

### IT-17 — Document dùng cùng Strategy với code (IC-D1)
- **Level:** IT · **Trace:** IC-D1
- **Test Data:** file document (.md) không đổi rồi đổi.
- **Steps:** classify document qua cùng GitBlob/Fallback strategy.
- **Expected Result:** Không đổi → skip; đổi → re-index (nhất quán với Nguồn C).

### 3.4 Security isolation (IT-18..IT-21)

### IT-18 — Cross-tenant isolation: existing chỉ trong đúng project (SEC-01c/SEC-10)
- **Level:** IT · **Trace:** SEC-01c, SEC-10
- **Preconditions:** `multi-tenant.json` — checksum `aaaa...` tồn tại ở CẢ PegaCollProj và OtherProj.
- **Test Data:** identity = PegaCollProj; gửi checksums=[aaaa..., cccc...] (cccc chỉ thuộc OtherProj).
- **Steps:** bulk-check với identity PegaCollProj.
- **Expected Result:** existing = [aaaa...] (thuộc PegaCollProj); `cccc...` KHÔNG trả (chỉ thuộc OtherProj) → không leak cross-tenant.

### IT-19 — Mutation scope theo identity, bỏ `OR 'PegaCollProj'` (SEC-02)
- **Level:** IT · **Trace:** SEC-02
- **Preconditions:** 2 project có data.
- **Test Data:** identity = OtherProj; thực hiện clear/ingest.
- **Steps:** gọi mutation route với identity OtherProj → kiểm DB PegaCollProj.
- **Expected Result:** Chỉ data OtherProj bị ghi/xoá; PegaCollProj KHÔNG bị ảnh hưởng; query không chứa `OR project_id='PegaCollProj'` (behavior + grep bổ trợ).

### IT-20 — Resumable download abort khi x-file-size vượt ngưỡng (SEC-05a, IT-level)
- **Level:** IT · **Trace:** SEC-05a
- **Test Data:** mock server trả x-file-size = 300MB.
- **Steps:** chạy downloader thật với mock HTTP.
- **Expected Result:** Abort trước khi tải hết; state giữ nguyên; báo user.

### IT-21 — Zip-bomb abort khi giải nén (SEC-05b, IT-level)
- **Level:** IT · **Trace:** SEC-05b
- **Test Data:** zip fixture uncompressed > MAX_UNCOMPRESSED_SIZE.
- **Steps:** unzip pipeline thật.
- **Expected Result:** Abort giải nén; báo user; không tạo file.

### 3.5 Edge / Reliability (IT-22..IT-27)

### IT-22 — Export/CSV fail → giữ state, không ghi đè (E-01/BR-13/TC-09)
- **Level:** IT · **Trace:** E-01, BR-13, TC-09
- **Preconditions:** DB có state (checksum) từ lần trước.
- **Test Data:** mock export trả lỗi/CSV rỗng.
- **Steps:** chạy incremental.
- **Expected Result:** Dừng an toàn; DB `content_hash` KHÔNG bị xoá/ghi đè; báo E-01; cho retry.

### IT-23 — bulk-check lỗi → full run fallback (E-04/BR-15/TC-10)
- **Level:** IT · **Trace:** E-04, BR-15, TC-10
- **Test Data:** mock bulk-check timeout/500.
- **Steps:** StateComparer gặp lỗi bulk-check.
- **Expected Result:** existing = ∅ → tất cả vào fetch (full run); warning E-04; KHÔNG bỏ qua index (no false-negative).

### IT-24 — Fetch 1 item delta lỗi → isolate; item khác tiếp tục (E-05/BR-16/TC-11)
- **Level:** IT · **Trace:** E-05, BR-16, TC-11
- **Test Data:** delta 3 rule; mock fetch rule #2 lỗi.
- **Steps:** chạy fetch+ingest loop.
- **Expected Result:** rule #1,#3 index thành công + content_hash cập nhật; rule #2 KHÔNG cập nhật content_hash (giữ state cũ để lần sau retry); error=1; rule khác không hỏng.

### IT-25 — Encoded-slash insKey fetch qua backend fallback (OI-03, IT-level)
- **Level:** IT · **Trace:** OI-03
- **Test Data:** insKey chứa `/`.
- **Steps:** fetch-rule qua backend với insKey encode.
- **Expected Result:** Fetch thành công (query/encode fallback), không 404 do path segment thô.

### IT-26 — Resumable download happy path: 206 + base64 + x-file-size (IT-level)
- **Level:** IT · **Trace:** §13.1 FSD
- **Test Data:** mock server trả 206, body base64 nhiều chunk, header x-file-size (KHÔNG content-range total).
- **Steps:** downloader concat → decode → unzip → parse CSV.
- **Expected Result:** CSV parse đúng số dòng; size verify khớp x-file-size; magic đúng.

### IT-27 — Lưu state/ingest lỗi → item lại vào delta lần sau (E-06)
- **Level:** IT · **Trace:** E-06
- **Test Data:** mock ingest lỗi cho 1 item.
- **Steps:** chạy; sau đó chạy lại.
- **Expected Result:** Item lỗi KHÔNG có content_hash → lần sau lại vào delta (chỉ mất hiệu năng, không sai đúng đắn); báo lỗi.

---
## 4. E2E-API Tests (API) — Security & Contract (Vitest + Hono app.request(), full middleware chain)

> Chạy qua HTTP layer thật với **full middleware** (jwtAuth, rateLimiter, zod). `CODE_INTEL_REQUIRE_AUTH=true`. DB thật.

### API-01 — Happy path: bulk-check trả existing đúng
- **Level:** API · **Trace:** IC-03
- **Preconditions:** DB có h1,h2 trong PegaCollProj; JWT hợp lệ (pid=PegaCollProj) hoặc header `X-Project-Id: PegaCollProj`.
- **Test Data:** body `{ projectId:"PegaCollProj", checksums:[h1,h2,h3] }`.
- **Steps:** `app.request('/pega/rulecatalog/bulk-check', {method:'POST', headers:{Authorization, 'X-Project-Id'}, body})`.
- **Expected Result:** 200; `{ data:{ existing:[h1,h2] }, error:null }`.

### API-02 — SEC-01a: thiếu identity (không X-Project-Id/JWT) → 401
- **Level:** API · **Trace:** SEC-01a
- **Test Data:** body hợp lệ nhưng KHÔNG có header identity; `CODE_INTEL_REQUIRE_AUTH=true`.
- **Steps:** POST bulk-check không header auth.
- **Expected Result:** HTTP **401**; `error.code = MISSING_PROJECT_IDENTITY`; KHÔNG fallback 'PegaCollProj'; không trả existing.

### API-03 — SEC-01b: body.projectId ≠ identity → 403
- **Level:** API · **Trace:** SEC-01b
- **Test Data:** identity (JWT pid / X-Project-Id) = PegaCollProj; body `{ projectId:"OtherProj", checksums:[...] }`.
- **Steps:** POST bulk-check.
- **Expected Result:** HTTP **403**; `error.code = PROJECT_MISMATCH`; không truy vấn/không trả existing.

### API-04 — SEC-01c: existing chỉ chứa checksum đúng project (no cross-tenant)
- **Level:** API · **Trace:** SEC-01c, SEC-10
- **Preconditions:** `aaaa...` ở cả PegaCollProj & OtherProj; `cccc...` chỉ ở OtherProj.
- **Test Data:** identity=PegaCollProj; checksums=[aaaa..., cccc...].
- **Steps:** POST bulk-check.
- **Expected Result:** 200; existing=[aaaa...]; cccc... KHÔNG trả (dù tồn tại ở OtherProj) → scope theo identity.

### API-05 — SEC-02: mutation không xoá/ghi cross-tenant qua HTTP
- **Level:** API · **Trace:** SEC-02
- **Test Data:** identity=OtherProj; gọi ingest/clear.
- **Steps:** thực hiện mutation; sau đó bulk-check PegaCollProj (với identity PegaCollProj) kiểm data còn nguyên.
- **Expected Result:** Data PegaCollProj không đổi; mutation chỉ tác động OtherProj.

### API-06 — SEC-04: projectId sai regex → 400
- **Level:** API · **Trace:** SEC-04a
- **Test Data:** body `{ projectId:"bad id!@#", checksums:[<hex hợp lệ>] }` (identity khớp hoặc test riêng zod trước authz-mismatch).
- **Steps:** POST bulk-check.
- **Expected Result:** HTTP **400**; `error.code = VALIDATION_FAILED` (projectId không match `^[A-Za-z0-9_-]+$`).

### API-07 — SEC-04: checksum không phải hex → 400
- **Level:** API · **Trace:** SEC-04a, SEC-04c
- **Test Data:** checksums=["ZZZZ_not_hex", "9f2c...(64hex hợp lệ)"].
- **Steps:** POST bulk-check với identity hợp lệ.
- **Expected Result:** HTTP **400** VALIDATION_FAILED (item không match `^[0-9a-f]{40}$|^[0-9a-f]{64}$`). Không truy vấn DB.

### API-08 — SEC-04: array > 5000 checksum → 400
- **Level:** API · **Trace:** SEC-04b
- **Test Data:** checksums = mảng 5001 hex hợp lệ.
- **Steps:** POST bulk-check.
- **Expected Result:** HTTP **400** VALIDATION_FAILED (max 5000 — chống payload lớn CWE-400). Boundary: 5000 → OK (200), 5001 → 400.

---

## 5. E2E-UI Tests (UI) — Command "Index Source Code" flow (Playwright / Extension Host harness)

### UI-01 — Summary notification hiển thị đúng số liệu
- **Level:** UI · **Trace:** BR-12, FSD §3.1.5
- **Mục tiêu:** Sau incremental run, summary message hiển thị skipped/reindexed/removed/error + duration.
- **Preconditions:** backend stub trả report {skipped:16, reindexed:3, removed:1, error:1}.
- **Test Data:** kịch bản mix như IT-13.
- **Steps (Gherkin):**
  ```
  Given extension đã cấu hình Pega + backend
  When Developer chạy command "Index Source Code"
  And backend trả report skipped=16 reindexed=3 removed=1 error=1
  Then notification hiển thị "Index xong: skipped 16, reindexed 3, removed 1, error 1"
  And có hiển thị thời gian tổng (⏱)
  ```
- **Expected Result:** Wording summary khớp; số liệu đúng; progress notification hiển thị trong lúc chạy.

### UI-02 — Warning/Error notification (E-01/E-03/E-05) hiển thị cho user
- **Level:** UI · **Trace:** E-01, E-03, E-05, code-standards (không nuốt lỗi)
- **Mục tiêu:** Lỗi/cảnh báo phải hiển thị cho user (không nuốt exception).
- **Test Data:** kịch bản export fail (E-01); checksum lệch (E-03); fetch 1 rule lỗi (E-05).
- **Steps (Gherkin):**
  ```
  Given export Pega thất bại
  When Developer chạy "Index Source Code"
  Then output channel hiển thị thông báo E-01 "Không thể lấy Rule Catalog... trạng thái trước được giữ nguyên"
  And index bị hủy an toàn (không ghi đè state)
  ```
- **Expected Result:** Mỗi lỗi có message user-facing tương ứng; không có lỗi bị nuốt im lặng.

---

## 6. SIT Tests (SIT) — Visual / UX / Performance (thủ công có kịch bản, môi trường Pega + backend thật)

### SIT-01 — No-change run "gần như tức thì" (performance thực tế)
- **Level:** SIT · **Trace:** Story 1 AC, NFR §6, TC-02
- **Mục tiêu:** Trên tập ~17,978 rule đã index, lần chạy 2 (no-change) skip ~100% và nhanh rõ rệt.
- **Preconditions:** Pega export thật có 3 cột checksum; backend thật; đã index đầy đủ lần 1.
- **Steps:**
  1. Ghi thời gian lần 1 (full run).
  2. Chạy lần 2 không đổi rule; đo thời gian + đọc report.
- **Expected Result:** skip ≥ 99.5% (mục tiêu ~100%); thời gian lần 2 ≈ export+poll+download+parse+bulk-check (không fetch rule); giảm rõ rệt so với lần 1. Trải nghiệm mượt, progress rõ ràng.

### SIT-02 — Regression non-Pega trực quan trên repo hỗn hợp
- **Level:** SIT · **Trace:** Story 4, BR-17, TC-12
- **Mục tiêu:** Repo Pega + code thường: index code non-Pega hành vi không đổi; skip file không đổi.
- **Steps:** chạy index repo hỗn hợp 2 lần; kiểm symbol/kết quả non-Pega không đổi; file không đổi được skip.
- **Expected Result:** Kết quả index non-Pega giống trước feature; file không đổi skip; không lỗi hiển thị.

### SIT-03 — UX báo lỗi & phục hồi (export fail giữa chừng)
- **Level:** SIT · **Trace:** E-01, BR-13, UX
- **Mục tiêu:** Khi export Pega fail thật, user thấy thông báo rõ ràng và có thể retry mà state cũ nguyên vẹn.
- **Steps:** giả lập/ngắt export giữa chừng; quan sát notification; retry.
- **Expected Result:** Thông báo dễ hiểu; state cũ giữ nguyên; retry chạy lại đúng; không mất dữ liệu index cũ.

---

## 7. Traceability tổng hợp (Test Case → Requirement)

| Level | Case IDs | Requirement chính phủ |
|-------|----------|-----------------------|
| PBT | PBT-01..06 | BR-04, IC-02, INV-1, NT-3, IC-05 |
| UT | UT-01..35 | BR-04, IC-01/02/A2/A3/B1/B2/C1/C2/06, E-02/03, NT-3/4, IC-M2, SEC-05/06, OI-03/06, §13.1 |
| IT | IT-01..27 | INV-1, IC-03/04/05/07/A2/B1/C3/D1/M1, BR-02/03/07/10/11/12/13/15/16/18, SEC-01c/02/05, E-01/04/05/06/07, TC-02..06/09..12, OI-03 |
| API | API-01..08 | IC-03, SEC-01a/b/c, SEC-02, SEC-04a/b/c, SEC-10 |
| UI | UI-01..02 | BR-12, E-01/03/05, FSD §3.1.5 |
| SIT | SIT-01..03 | Story 1/4 AC, NFR §6, TC-02/12, E-01/BR-13 |

**Coverage:** 100% BR (BR-01..18), IC (IC-01..M2), SEC (SEC-01..06 testable), TC (TC-01..13), E (E-01..07), INV/NT — xem RTM STP §3.

---

## 8. Test Data Files (CSV fixtures — kèm STC)

| File | Cột / Nội dung |
|------|----------------|
| `fixtures/pega-checksum-vectors.csv` | id, pzInsKey, pxUpdateDateTime, pxSaveDateTime, expected_payload, expected_sha256 (V1..V5) |
| `fixtures/git-blob-vectors.csv` | id, relativePath, content, expected_git_sha1 (G1..G4; G2 = blob rỗng e69de29...) |
| `fixtures/file-fallback-vectors.csv` | id, relativePath, content, expected_sha256 (F1..F3) |
| `fixtures/pega-rules-baseline.csv` | 16 cột gốc + pxUpdateDateTime, pxSaveDateTime, checksum (~20 rule) |
| `fixtures/pega-rules-changed.csv` | baseline + 1 rule đổi pxSaveDateTime |
| `fixtures/pega-datarule-vectors.csv` | DATA-X (2 phiên bản khác save-time) |
| `fixtures/multi-tenant.json` | PegaCollProj + OtherProj (checksum aaaa... trùng giá trị) |
| `fixtures/zip-slip-entries.json` | entry `../../etc/passwd`, `/absolute/evil`, symlink |
| `fixtures/malformed-download/` | metadata x-file-size vượt ngưỡng; zip-bomb (uncompressed/entries) |
| `fixtures/csv-malformed/` | thiếu cột checksum; checksum sai format; header append-cuối |

> **Sinh expected checksum (độc lập — TD-1):**
> ```bash
> # Pega
> node -e "const c=require('crypto');console.log(c.createHash('sha256').update(process.argv[1],'utf-8').digest('hex'))" "RULE-A|20260430T101500.000 GMT|20260430T101500.000 GMT"
> # git-blob
> printf 'export const x = 1;\n' > /tmp/a.ts && git hash-object /tmp/a.ts
> ```
