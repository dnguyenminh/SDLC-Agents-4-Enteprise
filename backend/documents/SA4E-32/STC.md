# STC — SA4E-32: Server-side Document Conversion khi Ingest

| Field | Value |
|-------|-------|
| Ticket | SA4E-32 |
| Document | Software Test Cases (STC) |
| Version | 1 |
| Author | qa-agent |
| Related STP | STP-v1-SA4E-32.docx |
| Status | Draft |

## Unit Tests (UT) — implemented, 10/10 pass

| ID | Test | Input | Expected | Status |
|----|------|-------|----------|--------|
| UT-01 | classify markdown | `BRD.md`, `x.markdown` | `markdown` | pass |
| UT-02 | classify text | `.txt/.csv/.json/.yaml/.yml/.xml/.log`, mime text/plain | `text` | pass |
| UT-03 | classify binary | `.docx/.xlsx/.xls/.pdf/.png/.jpg` | `binary` | pass |
| UT-04 | normalizeExt | `X.DOCX` | `.docx` | pass |
| UT-05a | buildQuery | `.docx/.xlsx/.png/.pdf` | query chứa docx/excel/image/pdf | pass |
| UT-05b | selectBestTool | tools + `.docx` | chọn `docx_to_markdown` | pass |
| UT-05c | extractMarkdown | raw / `{markdown}` / `{content}` | text đúng | pass |
| UT-06 | resolve no-tool | NullGateway | `ok=false, reason=no-tool` | pass |
| UT-07 | resolve success | gateway trả `# converted` | `ok=true, markdown, toolName` | pass |
| UT-08 | resolve convert-failed | tool throw | `reason=convert-failed` | pass |
| UT-09 | resolve empty-result | tool trả blank | `reason=empty-result` | pass |
| UT-10 | resolve timeout | tool chậm > limit | `reason=timeout` | pass |

File: `backend/src/modules/memory/ingest/__tests__/ingest.test.ts`

## Integration Tests (IT) — planned (task 9)

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| IT-01 | Direct ingest md | POST ingest-file `notes.md` | index thành công, không gọi resolver |
| IT-02 | Binary có content | POST `spec.docx` + content md | dùng content, index (tương thích ngược) |
| IT-03 | Binary no content, no tool | POST `logo.png` (không content), 0 child server | marker UNCONVERTIBLE reason=no-tool, KHÔNG index |
| IT-04 | dispatch async | gọi mem_ingest_file qua handler | trả Promise, await OK |
| IT-05 | Batch resilience | md + png(no-tool) | md ingested, png unconvertible, batch không fail |

## E2E-API — planned (task 9)

| ID | Test | Expected |
|----|------|----------|
| E2E-API-01 | POST batch md+docx(no-tool)+png(no-tool) | `ingested` chứa md; `unconvertible` chứa docx+png; KB không có entry cho unconvertible |

## E2E-UI — planned (task 7-8)

| ID | Gherkin |
|----|---------|
| E2E-UI-01 | Given workspace có ảnh trong documents/, When user index, Then Output Channel "SDLC Indexing" hiển thị "⚠️ <file> (reason=no-tool)" |

## PBT — planned (task 9)

| ID | Invariant |
|----|-----------|
| PBT-01 | Với mọi tập file: `summary.ingested + summary.unconvertible === summary.total` |
| PBT-02 | Mọi `unconvertible.reason` thuoc {no-tool, convert-failed, empty-result, schema-error, timeout} |
| PBT-03 | Không entry KB nào có `source` thuộc unconvertible (no-garbage) |
| PBT-04 | Binary input không bao giờ decode utf-8 (spy readText không gọi cho binary) |

## Test Data (CSV)

Xem `testdata/ingest-cases.csv` (planned): mỗi dòng `file,ext,format,hasContent,hasTool,expectedOutcome,expectedReason`.
