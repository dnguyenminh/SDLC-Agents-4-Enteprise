# STC.md — SA4E-387

## **Tiêu đề**
Test Cases — Enrichment với Dynamic Context Budget & Runtime Model Swap

## **Mô tả**
Test Cases chi tiết cho chức năng enrich LLM với Dynamic Context Budget và Runtime Model Swap.

> ⚠️ **Trạng thái thực thi: CHƯA THỰC HIỆN.** Ticket SA4E-387 chưa implement code (xem STATUS.json §Discrepancies). Tài liệu này chỉ định nghĩa test case và kết quả kỳ vọng; cột *Status/Actual Result* sẽ chỉ được điền sau khi chạy thật trên build thực tế (Phase 6 — Testing).

## **Test Cases**

### **Test Case 1: Resolve Active Model Per-Call**
| **ID** | **TC-001** |
| **Mapped to** | BR-02 + FSD §10 (Property: "Model swap between two enrich calls → second call uses new model's window") |
| **Priority** | MUST |
| **Precondition** | Env `LLM_OLLAMA_MODEL` hoặc `/model/swap` đã set model; server khởi động mới |
| **Description** | Mỗi lần enrich phải dùng model active tại thời điểm gọi, không phải model bị giữ nguyên lúc constructor. |
| **Steps** |
| 1. Set active model = `llama3.1:8b`. |
| 2. Gọi `LLMService.complete(messages)`. |
| 3. Chờ request đầu đi tới provider thành công. |
| 4. Gọi `POST /model/swap` sang model khác, chờ `setActiveModel()` rebuild adapter. |
| 5. Gọi `LLMService.complete(messages)` lần 2. |
| **Expected Result** | Lần 1 dùng `llama3.1:8b`; lần 2 dùng model mới sau swap (verify qua provider request log), không cần khởi động lại server. |
| **Status** | ⬜ Not Executed |

### **Test Case 2: Calculate Dynamic Budget**
| **ID** | **TC-002** |
| **Mapped to** | BR-01 + FSD §10 Unit (`computeInputBudget`) |
| **Priority** | MUST |
| **Precondition** | `ContextWindowDiscovery` trả về window `W` cho model active |
| **Description** | Budget input phải tính từ `W` với header/output/safety overhead, không dùng cap tĩnh 24000. |
| **Steps** |
| 1. Mock `discoverWindow()` trả `W = 8192`. |
| 2. Gọi `BudgetGuard.computeInputBudget(W, overhead)` với overhead cố định. |
| 3. Soi `inputBudget` kết quả. |
| **Expected Result** | `inputBudget = W − overhead` (≥ `RESERVED_OUTPUT_TOKENS` + `SAFETY_MARGIN` không bị trừ đôi); khác giá trị khi đổi `W`. |
| **Status** | ⬜ Not Executed |

### **Test Case 3: Context Window Discovery + Cache Invalidation**
| **ID** | **TC-003** |
| **Mapped to** | BR-03, BR-04 + FSD §10 Unit (`context-window.ts`) |
| **Priority** | MUST |
| **Precondition** | Server chạy, có/không env window theo model |
| **Description** | Window discovery có TTL (`WINDOW_CACHE_TTL_MS`, mặc định 5 phút theo BR-04) và bị invalidate ngay khi model swap (BR-02); không cache global vĩnh viễn. |
| **Steps** |
| 1. Gọi `ContextWindowDiscovery.getContextWindow()` lần 1 — đo thời gian. |
| 2. Gọi ngay lần 2 — phải hit cache. |
| 3. Gọi `invalidateWindowCache()` (qua `/model/swap`). |
| 4. Gọi lần 3 — phải miss cache (fetch lại). |
| 5. Đổi model sang model khác window — verify per-model key. |
| **Expected Result** | Lần 2 < 5ms (cache); lần 3 re-fetch; cache key theo model sau swap. |
| **Status** | ⬜ Not Executed |

### **Test Case 4: Build Prompt with Dynamic Budget**
| **ID** | **TC-004** |
| **Mapped to** | BR-05, BR-06 + TDD reference §3.4 |
| **Priority** | MUST |
| **Precondition** | `computeInputBudget()` đã trả `inputBudget` |
| **Description** | Prompt builder phải cap phần nội dung theo budget động truyền vào, không đọc hằng `PROMPT_TOKEN_CAP` tĩnh làm hành vi chính. |
| **Steps** |
| 1. Chuẩn bị nội dung ~12000 tokens, `inputBudget = 5000`, `CHARS_PER_TOKEN = 4`. |
| 2. Gọi `PromptBuilder.build(strategy, context, inputBudget)`. |
| 3. Đếm token phần nội dung trong prompt. |
| **Expected Result** | Phần nội dung ≤ `inputBudget` tokens (≈20000 chars); builder khuyến nghị wrap số dư. |
| **Status** | ⬜ Not Executed |

### **Test Case 5: Enrich Symbol nhiều round map-reduce**
| **ID** | **TC-005** |
| **Mapped to** | BR-07, BR-08, BR-09, BR-10 |
| **Priority** | MUST |
| **Precondition** | Symbol có body lớn hơn `inputBudget`; provider LLM stub trả nội dung pass-through |
| **Description** | Symbol vượt window được chunk, enrich từng phần, các chunk nào vẫn vượt được reduce tối đa `MAX_REDUCE_ROUNDS = 3`, chưa vừa thì best-effort summary. |
| **Steps** |
| 1. Ingest symbol giả lập body 100K chars. |
| 2. Gọi enrichment cho symbol đó. |
| 3. Đếm số round reduce từ provider stub log. |
| **Expected Result** | TẠI THỜI ĐIỂM DOCUMENT NÀY `ReductionPipeline.reduce()` là STUB fail-fast — case này **DỰ KIẾN THẤT BẠI** cho tới khi implement reduce thật (phase 5). Kỳ vọng sau khi implement: ≤ 3 round, không crash, kết hợp được output. |
| **Status** | ⬜ Not Executed |

### **Test Case 6: Ollama `num_ctx` từ window phát hiện**
| **ID** | **TC-006** |
| **Mapped to** | FSD §3.3 + §10 Edge ("`num_ctx` set correctly for Ollama after swap") |
| **Priority** | MUST |
| **Precondition** | Provider = `ollama`, adapter chạy local hoặc qua mạng test |
| **Description** | Mỗi request Ollama phải mang `options.num_ctx` theo window đã phát hiện của model active. |
| **Steps** |
| 1. Set model Ollama có window `W`. |
| 2. Gọi `LLMService.complete(messages)`. |
| 3. Capture request payload tới `/api/...` (proxy/spy). |
| **Expected Result** | Payload chứa `options.num_ctx = W`; đổi model qua swap → request sau có `num_ctx` mới. |
| **Status** | ⬜ Not Executed |

### **Test Case 7: Runtime Model Swap không lỗi**
| **ID** | **TC-007** |
| **Mapped to** | BR-02 + FSD §10 Property |
| **Priority** | MUST |
| **Precondition** | Hai provider đã cấu hình (`ollama` + 1 provider cloud) |
| **Description** | Swap giữa 2 provider runtime không làm in-flight request crash và không rò rỉ adapter cũ. |
| **Steps** |
| 1. Send request `POST /enrich` đang chờ phản hồi Ollama (LLM timeout 120s). |
| 2. Trong lúc chờ, gọi `POST /model/swap` tới provider khác. |
| 3. Chờ cả hai hoàn tất; đo bộ nhớ adapter |
| **Expected Result** | Request in-flight hoàn tất trên adapter cũ (không crash); request sau dùng adapter mới; không memory leak đáng kể. |
| **Status** | ⬜ Not Executed |

### **Test Case 8: Backward Compatibility với fallback cap**
| **ID** | **TC-008** |
| **Mapped to** | BR-05 |
| **Priority** | MUST |
| **Precondition** | Caller cũ không truyền `inputBudget` |
| **Description** | Caller không truyền `inputBudget` vẫn chạy với fallback `PROMPT_TOKEN_CAP` (không phải hard fail). |
| **Steps** |
| 1. Gọi code-path legacy không truyền `inputBudget`. |
| 2. Soi prompt builder path được chọn. |
| **Expected Result** | Chạy bình thường, dùng fallback cap, ghi cảnh báo legacy. |
| **Status** | ⬜ Not Executed |

### **Test Case 9: Performance Benchmark**
| **ID** | **TC-009** |
| **Mapped to** | STP Performance strategy + FSD §10 (regression collection) |
| **Priority** | SHOULD |
| **Precondition** | LLM stub phản hồi có độ trễ kiểm soát; đo baseline trước patch |
| **Description** | Overhead của budget/discovery/reduction không làm tăng chi phí đáng kể so với baseline. **Không có target số trong ticket** — baseline được đo trước patch, patch phải không làm chậm đáng kể (chốt % khi chạy). |
| **Steps** |
| 1. Đo baseline: enrich qua đường hiện có (stub) với collection p50/p95. |
| 2. Áp patch SA4E-387. |
| 3. Chạy lại cùng bộ đo, so sánh. |
| **Expected Result** | p95 sau patch ≤ baseline + biên đã chốt; không phát sinh tắc nghẽn mới trong pipeline. |
| **Status** | ⬜ Not Executed |

### **Test Case 10: Regression — cache không stale khi swap lại model cũ**
| **ID** | **TC-010** |
| **Mapped to** | BR-03, BR-04 (regression của cache sau A→B→A) |
| **Priority** | SHOULD |
| **Precondition** | Swap A→B→A |
| **Description** | Sau swap lại model cũ, cache phải refresh (không trả về window cũ của model đã bị thay). |
| **Steps** |
| 1. Đổi model A → B (window khác). |
| 2. Đổi lại A. |
| 3. Gọi enrich. |
| **Expected Result** | `num_ctx` dùng window của A đúng thời điểm hiện tại, không phải giá trị stale. |
| **Status** | ⬜ Not Executed |

## **Checklist**
- [ ] Thực thi Test Case 1-10 trên build có implementation SA4E-387.
- [ ] Ghi *Actual Result* thật cho từng case (kèm ngày chạy + commit SHA).
- [ ] Cập nhật TEST-REPORT.md sau khi chạy.
