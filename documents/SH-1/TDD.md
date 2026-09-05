# TDD – SmartLLM Hub

![architecture](diagrams/architecture.png)

*[Edit in draw.io](diagrams/architecture.drawio)*

![component](diagrams/component.png)

*[Edit in draw.io](diagrams/component.drawio)*

![class_diagram](diagrams/class_diagram.png)

*[Edit in draw.io](diagrams/class_diagram.drawio)*

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Class | [class_diagram.png](diagrams/class_diagram.png) | [class_diagram.drawio](diagrams/class_diagram.drawio) |

## 1. Công nghệ
Python 3.11+, FastAPI, Pydantic, httpx, APScheduler, SQLite, SQLAlchemy

## 2. Thiết kế lớp
- LlmProvider model
- ChatRequest model
- SmartRouter.select_best_provider()
- HealthChecker.run()
- Crawler.sync()

## 3. Sequence: Request Flow
Client -> Gateway -> Router -> Provider -> Response

## 4. Virtual Threads thay bằng asyncio
Dùng asyncio.gather cho health check đồng loạt

## 5. Test
Unit test cho router logic, integration test cho forward

## 6. Security Design
- **Bảo mật API Key**: API key của provider được lưu trong SQLite với cột `api_key` mã hoá cơ bản, không log ra stdout/stderr. Truy xuất qua biến môi trường `PROVIDER_SECRET_KEY` để mã hoá/dec mã hoá.
- **Input Validation**: Sử dụng Pydantic models cho `ChatCompletionRequest` để validate schema OpenAI-compatible trước khi forward. Rejects invalid payload với 400 Bad Request.
- **HTTPS & Transport**: Gateway chỉ chấp nhận HTTPS trong production. `httpx.AsyncClient` ép `verify=True`.
- **Rate Limit & Abuse Prevention**: Router tôn trọng `rpm_limit` của provider, queue request vượt limit sang provider tiếp theo. Gateway có middleware rate limit cơ bản 100 req/min/IP.
- **Secrets Management**: Crawler không lưu API key thô từ repo công khai, chỉ lưu pattern. Manual override registry yêu cầu xác thực operator nội bộ.
- **Audit Logging**: Log audit cho discovery, health check thất bại, fallback kích hoạt. Không log nội dung prompt hoặc API key.
- **CORS & Access Control**: CORS cho phép origin tin cậy. Endpoint registry maintenance chỉ expose nội bộ qua mạng nội bộ.

## 7. Error Handling
- **Mapping lỗi OpenAI-compatible**: Mọi exception được ánh xạ theo BR-11:
  - 400 Bad Request: schema invalid, tools not supported, context too long.
  - 429 Too Many Requests: provider rpm_limit đạt.
  - 503 Service Unavailable: no healthy provider và local fallback down.
  - 502 Bad Gateway: provider timeout / connection error.
- **Retry Policy**: Khi forward thất bại do timeout/5xx, router retry 1 lần với provider tiếp theo trong pool đủ điều kiện. Không retry vô hạn để tránh latency tăng.
- **Health Flapping**: Provider fail 1-2 lần giữ `is_healthy=true` nhưng cảnh báo; đánh dấu unhealthy sau 3 consecutive failures theo BR-03.
- **Fallback Logic**: Nếu pool remote rỗng, chuyển sang local llama-server. Nếu vượt context limit → 400, nếu local down → 503.
- **Exception Flow UC-01/E2, UC-04/E1, UC-05/E1**: Được triển khai trong `SmartRouter` và `GatewayExceptionHandler`.
- **Logging & Observability**: Structured logging với `logger.error` kèm `provider_id`, `error_code`, `latency_ms`. Metrics error rate được expose cho monitoring.

## 8. Implementation Checklist
- [ ] Khởi tạo project FastAPI với cấu trúc `gateway/app/main.py`, `gateway/router`, `gateway/services`, `gateway/models`
- [ ] Tạo schema SQLite bảng `providers` với các cột: id, base_url, api_key, model_name, supports_tool_calling, rpm_limit, is_healthy, latency_ms, manual_enable, updated_at
- [ ] Implement Pydantic models: `LlmProvider`, `ChatRequest`, `ChatResponse`
- [ ] Implement `SmartRouter.select_best_provider()` theo UC-04: lọc healthy, supports_tool_calling, load balancing theo latency_ms
- [ ] Implement `HealthChecker.run()` chạy định kỳ bằng APScheduler, cập nhật is_healthy, latency_ms, supports_tool_calling theo UC-03
- [ ] Implement `Crawler.sync()` crawl awesome-freellm-apis, deduplicate theo url, lưu registry theo UC-02
- [ ] Implement Gateway endpoint `POST /v1/chat/completions` với validation và mapping lỗi theo UC-01
- [ ] Implement streaming relay SSE nếu `stream=true`
- [ ] Implement fallback tới local llama-server theo UC-05 với kiểm tra context limit
- [ ] Implement registry maintenance API nội bộ cho manual enable/disable theo UC-06
- [ ] Thêm unit test cho router logic, health check, mapping lỗi
- [ ] Thêm integration test forward tới mock provider
- [ ] Cấu hình logging, metrics, và alert khi fallback active
- [ ] Review Security Design và Error Handling trước merge

Ticket: SH-1
