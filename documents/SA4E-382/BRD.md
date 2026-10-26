# Business Requirements Document (BRD)

## PeerBus — SA4E-382: Hướng dẫn nghiệp vụ PeerBus giữa các tab chat (Kiro extension)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-382 |
| Title | PeerBus inter-tab guidance — business requirements for agent-to-agent collaboration across chat tabs |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-10-25 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent | Create document |
| Peer Reviewer | SM Agent | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-25 | BA Agent | Initiate document — drafted from UG SA4E-369 v1.0 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

Tài liệu này định nghĩa yêu cầu nghiệp vụ cho tính năng PeerBus trong extension SDLC Agents 4 Enterprise (Kiro). PeerBus cho phép các agent trong các tab chat khác nhau của cùng một cửa sổ Kiro/VS Code trao đổi tác vụ với nhau mà không cần cấu hình.

Nguồn cơ sở: `documents/SA4E-369/UG.md` (User Guide, tác giả DEV Agent, v1.0, 2026-10-20), đặc biệt các phần:
- §1 Introduction (mục đích, đối tượng, điều kiện tiên quyết)
- §2 Getting Started (luồng làm việc peer exchange)
- §4 Usage — Session Tools Reference (peer_list, peer_send, peer_status)
- §5 User Interface Guide (badge, transcript prefix, peer list panel)
- §6 Auto-Run Behavior & Approval (Security)
- §7 Limits & Error Handling (PEER_001–010)
- §9 Restrictions & Scope

Citation: `documents/SA4E-369/UG.md:1-709`

### 1.2 Out of Scope

- Nhắn tin giữa các cửa sổ khác nhau (cross-window) hay giữa các máy khác nhau — chỉ trong cùng một instance/window. Citation: `documents/SA4E-369/UG.md:85,660`
- Giao tiếp qua mạng (socket, port, token, gateway, mDNS, HTTP). Citation: `documents/SA4E-369/UG.md:86,661`
- Lưu trữ dữ liệu — tất cả trạng thái peer ở trong bộ nhớ, mất khi đóng tab/cửa sổ. Citation: `documents/SA4E-369/UG.md:87,662`
- Thay thế pi-subagents hay acp_delegate. Citation: `documents/SA4E-369/UG.md:88,664`
- Cấu hình quelconque (không có file config, settings, env vars). Citation: `documents/SA4E-369/UG.md:182-191`

### 1.3 Preliminary Requirement

- Cài đặt Kiro / VS Code với extension Pi Chatbox (build hiện tại). Citation: `documents/SA4E-369/UG.md:60`
- Per-tab session support (epic SA4E-370 S3 — đã đưa vào). Citation: `documents/SA4E-369/UG.md:63`
- Ít nhất một tab chat mở (tab gọi) và một tab chat thứ hai (tab mục tiêu). Citation: `documents/SA4E-369/UG.md:64-65`
- Không cần cấu hình hay cài đặt thêm. Citation: `documents/SA4E-369/UG.md:66`

---

## 2. Business Requirements

### 2.1 High Level Process Map

Luồng nghiệp vụ cao cấp của PeerBus giữa các tab:

1. Agent trong tab A mở/làm việc → các tab khác trong cùng cửa sổ tự động đăng ký trên PeerBus (zero-config).
2. Agent tab A gọi `peer_list()` để nhận danh sách các tab/peer có sẵn, bao gồm trạng thái idle/busy và vai trò của mỗi agent.
3. Agent tab A chọn peer mục tiêu (tab B) theo vai trò/capability phù hợp, gọi `peer_send(tabId, message, async)`.
4. Tab B nhận tác vụ, auto-run (không cần phê duyệt giao tác), agent tab B thực thi và tạo phản hồi.
5. Phản hồi render về đúng tab A (blocking: trực tiếp trong kết quả tool call; async: qua `peer_status(taskId)`).
6. Các lỗi phổ biến (PEER_001–010) được xử lý với thông báo dễ hiểu.

Citation: `documents/SA4E-369/UG.md:122-128,204-355`

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source Ticket |
|---|------------------|----------|---------------|
| 1 | As a DEV agent, I want to send a security review task to a Security agent in another tab so that I can get expert findings without leaving my current flow. | MUST HAVE | SA4E-382 |
| 2 | As a QA agent, I want to receive peer review responses back on my own tab (not mixed with other tabs) so that I can act on the results in context. | MUST HAVE | SA4E-382 |
| 3 | As an agent, I want to list available peers via `peer_list` before sending so that I can choose an idle, capable target tab. | MUST HAVE | SA4E-382 |
| 4 | As an agent, I want to see peer busy/idle status before sending so that I can decide blocking vs async mode. | SHOULD HAVE | SA4E-382 |
| 5 | As an agent, I want clear friendly messages for PEER_001–010 errors so that I can recover without confusion. | SHOULD HAVE | SA4E-382 |

### 2.3 Details of User Stories

#### STORY 1: Gửi tác vụ review bảo mật qua peer

> As a DEV agent, I want to send a security review task to a Security agent in another tab so that I can get expert findings without leaving my current flow.

**Requirement Details:**
1. Agent gọi `peer_list()` để xem danh sách peer có sẵn. Citation: `documents/SA4E-369/UG.md:215-234`
2. Agent chọn tab có agent role là "security" (hoặc capabilities bao gồm "security-review"). Citation: `documents/SA4E-369/UG.md:136-159`
3. Agent gọi `peer_send(tabId_security, "Review the changes in src/auth.ts and report findings.", async: false)` (blocking). Citation: `documents/SA4E-369/UG.md:236-284`
4. Tab mục tiêu (Security agent) nhận tác vụ, auto-run, thực hiện review. Citation: `documents/SA4E-369/UG.md:78,466-480`
5. Nếu peer turn cần gọi tool, xuất hiện hộp phê duyệt trong tab mục tiêu (Option A). Citation: `documents/SA4E-369/UG.md:510-523`
6. Phản hồi review render về tab gọi (DEV agent) — không bị lẫn tab khác. Citation: `documents/SA4E-369/UG.md:271-279`

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| tabId | string | Yes | Mã định danh tab mục tiêu (lấy từ peer_list) | "3f8a1c2e-…" |
| message | string | Yes | Nội dung tác vụ/prompt gửi peer; ≤ 16,000 ký tự | "Review src/auth.ts" |
| async | boolean | No | false = blocking (mặc định), true = async | false |
| taskId | string | Yes (output) | Mã tác vụ để theo dõi | "t-7c31e9…" |
| reply | string | Output | Nội dung phản hồi từ peer | "Findings: 1) missing null check…" |
| state | string | Output | Trạng thái tác vụ: queued/running/completed/failed/cancelled | "completed" |

**Acceptance Criteria:**
1. Giao được tác vụ từ tab gọi đến tab mục tiêu trong cùng cửa sổ.
2. Phản hồi hiển thị đúng trên tab gọi, không hiển thị sai tab.
3. Peer target được chọn theo vai trò phù hợp (ví dụ: Security agent cho review bảo mật).
4. Thông báo lỗi dễ hiểu khi peer không có sẵn (PEER_001), gửi sai bản thân (PEER_002), v.v.

**UI Specifications:**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Peer inbound badge | Badge | Yes | Hiển thị trên tab pill, tăng khi có tác vụ đến | Citation: UG.md:381-400 |
| 2 | Transcript peer prefix | Label | Yes | "[Peer inbound] from <tab>" trong transcript tab nhận | Citation: UG.md:401-419 |
| 3 | Peer activity hint | Text line | Yes | Dòng dưới tool-block header tab gửi: đang chờ / đã nhận / thất bại | Citation: UG.md:438-454 |
| 4 | Peer list panel | Panel (tùy chọn) | Yes | Danh sách peer read-only, cột Tab ID / Agent Name / Status | Citation: UG.md:420-437 |

**Validation Rules:**
- `tabId` phải tồn tại trong registry (không phải tab đã đóng). Citation: `documents/SA4E-369/UG.md:251-258`
- `tabId` không được là tab của chính người gọi (self). Citation: `documents/SA4E-369/UG.md:254`
- `message` không được rỗng và không quá 16,000 ký tự. Citation: `documents/SA4E-369/UG.md:255`
- Rate limit: tối đa 10 tác vụ đến/60s mỗi tab; hàng đợi tối đa 20 tác vụ. Citation: `documents/SA4E-369/UG.md:541-544`

**Error Handling:**
- PEER_001: tabId không có trong registry → thông báo "Peer tab không có sẵn. Mở tab mục tiêu và thử lại." Citation: `documents/SA4E-369/UG.md:553`
- PEER_002: gửi đến chính tab gọi → "Không thể gửi tác vụ peer đến cùng một tab." Citation: `documents/SA4E-369/UG.md:554`
- PEER_006: blocking chờ quá 300s → "Tác vụ chưa hoàn thành kịp thời. Có thể vẫn đang chạy — kiểm tra với peer_status." Citation: `documents/SA4E-369/UG.md:558`

---

#### STORY 2: Nhận phản hồi peer về đúng tab gốc

> As a QA agent, I want to receive peer review responses back on my own tab (not mixed with other tabs) so that I can act on the results in context.

**Requirement Details:**
1. QA agent trong tab A gửi tác vụ review test case đến tab B (ví dụ: BA agent viết test case). Citation: `documents/SA4E-369/UG.md:236-284`
2. Phản hồi từ tab B phải render về đúng tab A (tab gọi), kèm `fromTabId` và `toTabId` để xác thực nguồn gốc. Citation: `documents/SA4E-369/UG.md:328-341`
3. Nếu dùng async mode, QA agent poll `peer_status(taskId)` trên tab A để nhận phản hồi khi hoàn thành. Citation: `documents/SA4E-369/UG.md:314-355`
4. Badge inbound tăng trên tab A nếu tác vụ đến khi tab A chưa focus. Citation: `documents/SA4E-369/UG.md:381-400`
5. Transcript của tab A hiển thị prefix `[Peer inbound] from <tabB>` khi phản hồi đến. Citation: `documents/SA4E-369/UG.md:401-419`

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| fromTabId | string | Output | Mã tab gửi tác vụ (nguồn gốc) | "9b2d4f01-…" |
| toTabId | string | Output | Mã tab nhận tác vụ (tab gọi) | "3f8a1c2e-…" |
| createdAt | datetime | Output | Thời điểm tạo tác vụ | "2026-10-25T03:12:00.000Z" |
| completedAt | datetime | Output | Thời điểm hoàn thành tác vụ | "2026-10-25T03:12:41.500Z" |

**Acceptance Criteria:**
1. Phản hồi chỉ xuất hiện trên tab gọi (tab A), không lẫn vào tab C hay tab D.
2. Mỗi phản hồi gắn nhãn rõ nguồn gốc (`fromTabId`, `[Peer inbound] from <tab>`).
3. Nếu tác vụ thất bại, tab gọi nhận được thông báo lỗi với mã PEER tương ứng (không bị lún).
4. Nếu tab mục tiêu đóng trước khi xử lý, tác vụ kết thúc thành `cancelled` (PEER_009) và tab gọi nhận thông báo. Citation: `documents/SA4E-369/UG.md:561`

**UI Specifications:**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Transcript peer prefix | Label | Yes | "[Peer inbound] from <tabB>" trên transcript tab A | Citation: UG.md:401-419 |
| 2 | Peer inbound badge | Badge | Yes | Tăng trên tab A khi phản hồi đến và tab A chưa focus | Citation: UG.md:381-400 |
| 3 | Peer activity hint | Text line | Yes | "✓ Peer agent replied" hoặc "✗ Peer task failed" trên tab A | Citation: UG.md:438-454 |

**Validation Rules:**
- `taskId` phải được lấy từ kết quả `peer_send` trước khi poll `peer_status`. Citation: `documents/SA4E-369/UG.md:309-311`
- `peer_status` chỉ nhận `taskId` hợp lệ (không được gọi với taskId cũ đã dở quá 60s). Citation: `documents/SA4E-369/UG.md:355,548`

**Error Handling:**
- PEER_008: `peer_status` với taskId không xác định → "Unknown peer task." Citation: `documents/SA4E-369/UG.md:560`
- PEER_009: tab mục tiêu đóng trước khi lấy tác vụ → "Peer task cancelled: target tab closed." Citation: `documents/SA4E-369/UG.md:561`

---

#### STORY 3: Liệt kê peer và chọn persona phù hợp trước khi gửi

> As an agent, I want to list available peers via `peer_list` before sending so that I can choose an idle, capable target tab.

**Requirement Details:**
1. Agent gọi `peer_list()` để nhận danh sách toàn bộ peer trong cùng cửa sổ, bao gồm chính tab gọi (self: true). Citation: `documents/SA4E-369/UG.md:215-234,161-169`
2. Mỗi entry trong danh sách chứa: tabId, agentName, role, capabilities, model, status (idle/busy), self. Citation: `documents/SA4E-369/UG.md:136-159`
3. Agent lọc ra các peer có `status: idle` và capability phù hợp với tác vụ (ví dụ: Security agent cho review bảo mật, QA agent cho viết test case). Citation: `documents/SA4E-369/UG.md:136-159,206-211`
4. Agent loại bỏ entry có `self: true` (không thể gửi đến chính mình). Citation: `documents/SA4E-369/UG.md:167`
5. Danh sách peer tự động cập nhật khi tab mở/đóng (peer:registered / peer:deregistered). Citation: `documents/SA4E-369/UG.md:134,429`

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| tabId | string | Yes | Mã định danh tab peer | "3f8a1c2e-…" |
| agentName | string | Yes | Tên agent trên tab đó | "Reviewer" |
| role | string | Yes | Vai trò agent | "security", "qa", "dev" |
| capabilities | string[] | Yes | Danh sách khả năng | ["code-review"] |
| model | string | Yes | Mô hình AI đang dùng | "glm-5.3" |
| status | string | Yes | "idle" hoặc "busy" | "idle" |
| self | boolean | Yes | true nếu là tab đang gọi | false |

**Acceptance Criteria:**
1. `peer_list()` trả về danh sách đầy đủ các tab peer trong cùng cửa sổ.
2. Mỗi entry hiển thị trạng thái idle/busy thời gian thực. Citation: `documents/SA4E-369/UG.md:234`
3. Tab gọi được đánh dấu `self: true` và không thể chọn làm mục tiêu gửi.
4. Agent có thể sao chép `tabId` từ kết quả `peer_list` để dùng trong `peer_send`. Citation: `documents/SA4E-369/UG.md:165`

**UI Specifications:**

| No. | Name | Type | Required | Description | Note |
|-----|------|--------|----------|-------------|------|
| 1 | Peer list panel | Panel (tùy chọn) | Yes | Bảng read-only: Tab ID, Agent Name, Status, Last Activity | Citation: UG.md:420-437 |
| 2 | Peer status dot | Indicator | Yes | Chấm màu phản ánh idle/busy trên tab header | Citation: UG.md:391 |

**Validation Rules:**
- Không được chọn peer có `self: true` làm mục tiêu `peer_send`. Citation: `documents/SA4E-369/UG.md:167,254`
- Chỉ chọn peer trong cùng cửa sổ (không hỗ trợ cross-window). Citation: `documents/SA4E-369/UG.md:85,660`

**Error Handling:**
- Nếu chỉ có 1 tab mở (chỉ có self), `peer_list` trả về 1 entry — có nghĩa là "không có peer nào để nhắn tin". Citation: `documents/SA4E-369/UG.md:233`
- PEER_001 nếu `tabId` đã không còn trong registry (tab đã đóng giữa lúc xem danh sách và lúc gửi). Citation: `documents/SA4E-369/UG.md:553`

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Per-tab session support | Infrastructure | SA4E-370 S3 | Mỗi tab có session riêng (lịch sử, token budget, compaction riêng). Citation: `documents/SA4E-369/UG.md:63,480` |
| Pi Chatbox extension | System | SA4E-369 | Extension chứa PeerBus, đã cài đặt trong Kiro/VS Code. Citation: `documents/SA4E-369/UG.md:60` |
| PeerBus in-process bus | Infrastructure | SA4E-369 | Backbone trong bộ nhớ route tác vụ peer giữa các tab cùng cửa sổ. Citation: `documents/SA4E-369/UG.md:74-81` |
| Approval gate (Option A) | Security | SA4E-369 | Mọi tool call trong peer turn cần phê duyệt rõ ràng. Citation: `documents/SA4E-369/UG.md:510-523` |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| SM Agent | SDLC Team | Điều phối luồng làm việc multi-tab, gọi peer khi cần hợp tác chuyên môn | UG.md:1-709 |
| BA Agent | SDLC Team | Thu thập yêu cầu nghiệp vụ, viết BRD/FSD | UG.md:1-709 |
| DEV Agent | SDLC Team | Thực thi tác vụ triển khai, review mã qua peer | UG.md:1-709 |
| QA Agent | SDLC Team | Viết test case, review kiểm thử qua peer | UG.md:1-709 |
| SA Agent | SDLC Team | Phân tích yêu cầu kỹ thuật, review bảo mật qua peer | UG.md:1-709 |
| Security Agent | SDLC Team | Review mã bảo mật qua peer | UG.md:1-709 |
| TA Agent | SDLC Team | Enrich FSD với độ sâu kỹ thuật | UG.md:1-709 |
| DevOps Agent | SDLC Team | Triển khai, CI/CD, bản phát hành | UG.md:1-709 |
| UI Agent | SDLC Team | Thiết kế giao diện, mockup | UG.md:1-709 |
| End-user / Developer | Người dùng Kiro | Mở tab, điều hướng agent, phê duyệt tool call khi peer turn cần | UG.md:50-57 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Hai agent ping-pong vô tận giữa hai tab | High | Medium | Anti-loop guard: giới hạn 5 lượt liên tiếp mỗi cặp, sau đó từ chối (PEER_004); gửi tin nhắn người dùng trong một trong hai tab để reset chuỗi. Citation: `documents/SA4E-369/UG.md:525-532` |
| Peer content gây mâu Injection vào agent tab mục tiêu | High | Low | Provenance envelope đánh dấu nội dung peer là "untrusted data"; mọi tool call trong peer turn cần phê duyệt rõ ràng (Option A). Citation: `documents/SA4E-369/UG.md:482-523` |
| Tab mục tiêu bận quá lâu, tác vụ treo hàng đợi | Medium | Medium | Giao tác vụ xếp hàng FIFO (tối đa 20); dùng async mode để không chặn luồng làm việc; poll `peer_status`. Citation: `documents/SA4E-369/UG.md:541-544,314-355` |
| Tác vụ mất khi đóng tab / cửa sổ (không lưu trữ) | Medium | Medium | Thông báo PEER_009 khi tab đóng; người dùng mở lại tab và gửi lại. Citation: `documents/SA4E-369/UG.md:87,662,561` |
| Nhầm tab phản hồi (phản hồi lẫn vào tab khác) | High | Low | Phản hồi render đúng `toTabId` và gắn prefix `[Peer inbound] from <tab>`; UI prefix từ header tin cậy, không từ nội dung tin nhắn. Citation: `documents/SA4E-369/UG.md:328-341,497-501` |

### 5.2 Assumptions

- Các agent đều biết cách gọi các công cụ `peer_list`, `peer_send`, `peer_status` qua ngôn ngữ tự nhiên.
- Mọi tác vụ peer diễn ra trong cùng một cửa sổ Kiro/VS Code instance (không cross-window).
- Không có cấu hình nào cần thiết (zero-config by design).
- Nội dung peer không được ghi log (chỉ log taskId, tabId, trạng thái, mã lỗi). Citation: `documents/SA4E-369/UG.md:618-620`

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Thời gian chờ blocking tối đa 300 giây (PEER_006) | Nếu quá thời gian, caller bị timeout nhưng tác vụ vẫn chạy và poll được qua `peer_status`. Citation: `documents/SA4E-369/UG.md:282-284,545` |
| Security | Nội dung peer đánh dấu "untrusted", cần phê duyệt tool call (Option A) | Mọi tool call trong peer turn yêu cầu phê duyệt rõ ràng của người dùng ở tab nhận. Citation: `documents/SA4E-369/UG.md:510-523` |
| Scalability | Giới hạn 10 tác vụ đến/60 giây mỗi tab; hàng đợi tối đa 20 tác vụ | Vượt giới hạn sẽ bị từ chối (PEER_005) và tự khôi phục khi cửa sổ thời gian lăn qua. Citation: `documents/SA4E-369/UG.md:541-544` |
| Availability | Hoạt động ngay khi ≥2 tab mở trong cùng cửa sổ; không cần cấu hình | Tính năng luôn bật, không có feature flag. Citation: `documents/SA4E-369/UG.md:182-191` |
| Usability | Thông báo lỗi PEER_001–010 dễ hiểu, không làm gián đoạn luồng làm việc | Mỗi mã lỗi có ý nghĩa thân quen và hướng khắc phục cụ thể. Citation: `documents/SA4E-369/UG.md:549-562` |
| Reliability | Giao tác bị từ chối không để lại trace (zero-state rejection) | Không tạo tác vụ, không tăng bộ đếm, không có dòng transcript. Citation: `documents/SA4E-369/UG.md:251-258,566-568` |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-382 | PeerBus inter-tab guidance — business requirements | Draft | Story | Main ticket |
| SA4E-369 | Intra-instance agent-to-agent messaging between chatbox tabs (local PeerBus, zero-config) | Completed | Epic | Related — cung cấp UG/FSD/TDD cơ sở |
| SA4E-370 | Per-tab session support | Completed | Epic | Dependency — cung cấp per-tab session host |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| PeerBus | Backbone trong bộ nhớ route tác vụ peer giữa các tab chat của cùng một cửa sổ. |
| Peer | Một tab chat được đăng ký làm điểm cuối nhắn tin agent-to-agent. |
| tabId | Mã định danh duy nhất của một tab chat trong cửa sổ (sao chép từ `peer_list`). |
| PeerTask | Một đơn vị gửi; có `taskId`, `state`, tuỳ chọn `reply` hoặc `error`. |
| Blocking mode | `peer_send(async=false)` — chờ đợi lượt xử lý của tab nhận (≤ 300 giây). |
| Async mode | `peer_send(async=true)` — trả về `taskId` ngay; poll `peer_status` sau. |
| Terminal state | `completed`, `failed` hoặc `cancelled`. |
| Auto-run | Tác vụ peer đến kích hoạt lượt agent của tab nhận mà không cần phê duyệt giao tác. |
| Provenance envelope | Header tiêu chuẩn đánh dấu nội dung peer là dữ liệu không tin cậy (không phải chỉ thị của người dùng). |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| User Guide SA4E-369 v1.0 | documents/SA4E-369/UG.md |
| BRD SA4E-369 v1.0 | documents/SA4E-369/BRD.md |
| FSD SA4E-369 v1.2 | documents/SA4E-369/FSD.md |
| TDD SA4E-369 v1.1 | documents/SA4E-369/TDD.md |
| UI-SPEC SA4E-369 v1.0 | documents/SA4E-369/UI-SPEC.md |
| STP SA4E-369 v1.0 | documents/SA4E-369/STP.md |

---
*End of BRD-draft — SA4E-382 v1.0 (Draft)*

---

---
