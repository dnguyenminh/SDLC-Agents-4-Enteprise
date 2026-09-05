# FSD – SmartLLM Hub

## 1. Tổng quan kiến trúc
FastAPI Gateway -> Smart Router -> Provider Pool
Database: SQLite
Scheduler: APScheduler

![architecture](diagrams/architecture.png)

*[Edit in draw.io](diagrams/architecture.drawio)*

![system_context](diagrams/system_context.png)

*[Edit in draw.io](diagrams/system_context.drawio)*

![state_provider](diagrams/state_provider.png)

*[Edit in draw.io](diagrams/state_provider.drawio)*

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | System Context | [system_context.png](diagrams/system_context.png) | [system_context.drawio](diagrams/system_context.drawio) |
| 3 | State Provider | [state_provider.png](diagrams/state_provider.png) | [state_provider.drawio](diagrams/state_provider.drawio) |

## 2. Luồng chính
Client POST /v1/chat/completions -> Router chọn provider -> Forward request -> Return response

![sequence_chat_completion](diagrams/sequence_chat_completion.png)

*[Edit in draw.io](diagrams/sequence_chat_completion.drawio)*

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Sequence Chat Completion | [sequence_chat_completion.png](diagrams/sequence_chat_completion.png) | [sequence_chat_completion.drawio](diagrams/sequence_chat_completion.drawio) |

## 3. Module
- gateway/app/main.py
- gateway/router/smart_router.py
- gateway/services/health_checker.py
- gateway/services/crawler.py
- gateway/models/provider.py

## 4. API Spec
POST /v1/chat/completions
Request: OpenAI ChatCompletionRequest
Response: OpenAI ChatCompletionResponse

## 5. Dữ liệu
Bảng providers: id, base_url, api_key, model_name, supports_tool_calling, rpm_limit, is_healthy, latency_ms

Ticket: SH-1

## 6. Use Cases Chi Tiết

Các Use Case được trích xuất từ BRD SH-1 và liên kết trực tiếp tới User Stories, Functional Requirements và Acceptance Criteria.

### UC-01: OpenAI-compatible Chat Completion Gateway
**Actor:** OpenCode agent user / Client Application  
**Liên kết:** US-1, FR1, FR4, NFR1, NFR3  
**Mô tả:** Client gửi request Chat Completion tới endpoint duy nhất của Hub.

**Precondition:** Gateway đang chạy, ít nhất 1 provider healthy hoặc fallback local sẵn sàng.

**Main Flow:**
1. Client POST `POST /v1/chat/completions` với payload OpenAI ChatCompletionRequest.
2. Gateway validate schema request, ánh xạ lỗi về OpenAI-compatible error codes.
3. Smart Router chọn provider theo logic routing UC-04.
4. Request được forward tới provider đã chọn.
5. Response từ provider được chuẩn hoá về OpenAI ChatCompletionResponse.
6. Gateway trả response về client.

**Alternative Flow A1 - Rate limit:**
- Router phát hiện provider đạt rpm_limit → chuyển sang provider tiếp theo trong pool đủ điều kiện.

**Alternative Flow A2 - Streaming:**
- Nếu request có `stream=true` → forward streaming response và relay SSE về client.

**Exception Flow E1 - Invalid schema:**
- Gateway trả 400 Bad Request với error code OpenAI-compatible.

**Exception Flow E2 - No provider available:**
- Kích hoạt fallback UC-05, nếu fallback cũng thất bại → trả 503 Service Unavailable.

### UC-02: Auto-discovery of Free LLM Providers
**Actor:** System Operator / Scheduler  
**Liên kết:** US-2, FR2  
**Mô tả:** Hub tự động crawl repo awesome-freellm-apis để cập nhật provider registry.

**Main Flow:**
1. Scheduler trigger crawl job định kỳ.
2. Crawler tải nội dung awesome-freellm-apis repository.
3. Parser trích xuất metadata: name, url, api_key pattern, supports_tools flag.
4. Deduplicate theo url.
5. Lưu/ cập nhật vào bảng providers với trạng thái mặc định is_healthy=false.
6. Log audit discovery results.

**Alternative Flow A1 - Repo thay đổi cấu trúc:**
- Parser fallback về regex cơ bản, ghi cảnh báo.

**Exception Flow E1 - Repo offline:**
- Job fail, giữ registry hiện tại, emit alert và retry sau.

### UC-03: Health & Capability Check
**Actor:** Health Checker Service  
**Liên kết:** US-3, FR3, NFR2  
**Mô tả:** Kiểm tra định kỳ latency, success rate và khả năng tool calling của provider.

**Main Flow:**
1. Health checker lấy danh sách providers chưa disable.
2. Gửi health ping / chat completion test ngắn.
3. Đo latency_ms, ghi nhận success/failure.
4. Kiểm tra capability tool calling bằng request có `tools` param.
5. Cập nhật is_healthy, latency_ms, supports_tool_calling, timestamp.

**Alternative Flow A1 - Flapping:**
- Provider fail 1-2 lần liên tiếp → vẫn giữ healthy nhưng cảnh báo.

**Exception Flow E1 - 3 consecutive failures:**
- Provider được đánh dấu is_healthy=false sau 3 lần fail liên tiếp.

### UC-04: Smart Routing by Tool Presence
**Actor:** Smart Router  
**Liên kết:** US-4, FR4, US-3  
**Mô tả:** Chọn provider phù hợp dựa trên presence của tools trong request và health status.

**Main Flow:**
1. Nhận request đã validate.
2. Kiểm tra request có chứa `tools` hay không.
3. Lọc pool provider healthy và `supports_tool_calling=true` nếu request có tools.
4. Load balancing theo latency_ms thấp nhất / round-robin.
5. Forward request tới provider được chọn.

**Alternative Flow A1 - Không có provider hỗ trợ tool:**
- Trả lỗi 400 với message "No provider supports tool calling".

**Alternative Flow A2 - Pool rỗng:**
- Chuyển sang UC-05 Fallback.

**Exception Flow E1 - Provider timeout trong lúc forward:**
- Retry 1 lần với provider tiếp theo, nếu fail → fallback.

### UC-05: Local Fallback llama-server
**Actor:** System Operator  
**Liên kết:** US-5, FR5, NFR2  
**Mô tả:** Khi không có remote provider healthy, route tới local llama-server.

**Main Flow:**
1. Router phát hiện pool remote rỗng.
2. Kiểm tra local llama-server health.
3. Validate request context length ≤ local model limit.
4. Forward request tới local llama-server.
5. Trả response OpenAI-compatible.
6. Emit alert "Fallback active".

**Alternative Flow A1 - Request vượt context limit:**
- Trả 400 với lỗi context too long, không fallback.

**Exception Flow E1 - Local server down:**
- Trả 503 Service Unavailable, ghi log critical.

### UC-06: Provider Registry Maintenance
**Actor:** Developer / Operator  
**Liên kết:** US-6, FR2, FR3, FR4  
**Mô tả:** Xem và override thủ công provider registry.

**Main Flow:**
1. Developer truy cập registry store.
2. Xem danh sách provider với metadata và health status.
3. Bật/tắt manual enable/disable flag.
4. Thay đổi được persist vào SQLite và áp dụng ngay bởi router.

**Alternative Flow A1 - Override health:**
- Manual enable buộc provider được chọn dù health check fail.

**Exception Flow E1 - Thay đổi không hợp lệ:**
- Validation lỗi, trả thông báo và không persist.

## 7. Business Rules

| ID | Quy tắc | Nguồn |
|----|---------|-------|
| BR-01 | Mọi request tới `/v1/chat/completions` phải tuân thủ OpenAI ChatCompletion schema và response phải tương thích OpenAI. | US-1 AC1.1, AC1.2 |
| BR-02 | Request có `tools` trong payload chỉ được route tới provider có `supports_tool_calling=true` và `is_healthy=true`. | US-4 AC4.2 |
| BR-03 | Provider bị đánh dấu `is_healthy=false` sau 3 consecutive failures trong health check. | US-3 AC3.2 |
| BR-04 | Health check phải đo latency, success rate và capability tool calling. | US-3 AC3.1, AC3.4 |
| BR-05 | Crawl job chạy định kỳ và deduplicate provider theo `url`. | US-2 AC2.1, AC2.3 |
| BR-06 | Khi không có remote provider healthy, hệ thống phải fallback tới local llama-server nếu request hợp lệ. | US-5 AC5.1 |
| BR-07 | Fallback bị bypass nếu request vượt quá context limit của local model. | US-5 AC5.4 |
| BR-08 | Manual enable/disable flag trong registry được ưu tiên hơn health status tự động. | US-6 AC6.2 |
| BR-09 | Latency P95 cho request thành công phải < 2s. | NFR1 |
| BR-10 | Uptime mục tiêu > 99% nhờ health check và fallback. | NFR2 |
| BR-11 | Lỗi hệ thống phải được ánh xạ tới OpenAI-compatible error codes và messages. | US-1 AC1.5 |
| BR-12 | Thay đổi registry phải persist qua restart. | US-6 AC6.3 |

## 8. Traceability

| Use Case | User Story | Functional Requirement | Acceptance Criteria |
|----------|------------|------------------------|---------------------|
| UC-01 | US-1 | FR1, FR4 | AC1.1-AC1.5 |
| UC-02 | US-2 | FR2 | AC2.1-AC2.4 |
| UC-03 | US-3 | FR3 | AC3.1-AC3.4 |
| UC-04 | US-4 | FR4 | AC4.1-AC4.4 |
| UC-05 | US-5 | FR5 | AC5.1-AC5.4 |
| UC-06 | US-6 | FR2, FR3, FR4 | AC6.1-AC6.3 |

Ticket: SH-1
