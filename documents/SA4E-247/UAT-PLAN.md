# UAT Plan — SA4E-247

## SDLC-Agents-4-Enterprise — Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-247 |
| Title | UAT Plan |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-07 |
| Status | Draft |
| Related BRD | BRD.md |
| Related FSD | FSD.md |
| Related STP/STC | STP.md, STC.md |
| Related UG | UG.md |

---

## 1. Purpose & Scope

### 1.1 Mục tiêu UAT
Xác nhận các yêu cầu nghiệp vụ từ BRD và FSD được đáp ứng đúng kỳ vọng người dùng thực tế:
- Legend Window độc lập draggable/resizable/maximizable/scrollable
- Minimap Enhanced với rotate/span/zoom-to-click
- Filter Panel với tìm kiếm text wildcard * và ?, lọc realtime

### 1.2 Phạm vi UAT
**In Scope:**
- 3 User Stories MUST/SHOULD HAVE từ BRD 2.2
- Acceptance Criteria từ BRD 2.3
- Business Rules BR-01 đến BR-06
- UX flows từ UG 4.1-4.3

**Out of Scope:**
- Backend API logic
- Layout algorithm
- Performance benchmark chi tiết — đã test trong Phase 6

### 1.3 Nguyên tắc
UAT là human acceptance gate. QA chuẩn bị kịch bản, data, hướng dẫn; PO/User thực hiện sign-off cuối cùng.

---

## 2. Participants

| Role | Name/Team | Responsibility |
|------|-----------|----------------|
| Product Owner | Duc Nguyen Minh | Sign-off cuối cùng |
| BA | BA Agent | Hỗ trợ làm rõ AC |
| QA Lead | QA Agent | Chuẩn bị UAT Plan/Checklist, data, hướng dẫn |
| UAT Tester | End User / Power User | Thực thi checklist |
| Developer | DEV Agent | Hỗ trợ bug fix nếu có |
| Scrum Master | SM | Điều phối lịch |

---

## 3. Schedule đề xuất

| Activity | Thời gian | Người thực hiện |
|----------|-----------|-----------------|
| UAT Prep & tài liệu | 2026-09-07 | QA |
| Review UAT Plan với PO | 2026-09-08 09:00-09:30 | PO, BA, QA |
| UAT Execution | 2026-09-09 09:00-11:00 | UAT Tester |
| Defect retest | 2026-09-10 | DEV + QA |
| Sign-off | 2026-09-11 | PO |

---

## 4. Test Environment & Data

### 4.1 Environment
- VS Code Extension webview production build
- URL: local extension panel KB Graph
- Browser: Chrome 120+

### 4.2 UAT Test Data
- Pre-seeded node types: 50 types cơ bản, 500 types cho scroll test
- Wildcard test set: ACTIVITY, ACTION, ACTOR, CLASS, CLASSX, CLASSY
- Special chars: type chứa dấu gạch dưới, số

### 4.3 Access
- PO có quyền truy cập extension phiên bản release candidate
- Không cần auth đặc biệt — UI only

---

## 5. UAT Test Scenarios

### 5.1 Legend Window Independent — Story 1
**AC từ BRD:**
1. Legend hiển thị trong cửa sổ độc lập có title bar với minimize/maximize/close
2. Cửa sổ drag move và resize
3. Nội dung scrollable
4. Component tách riêng

**UAT Scenario UAT-LG-01**
- Precondition: KB Graph loaded
- Steps: Mở Legend → Drag → Resize → Maximize → Minimize → Scroll
- Pass Criteria: Vị trí/size giữ sau reload, scroll mượt

### 5.2 Minimap Enhanced — Story 2
**AC:**
1. Thumbnail hiển thị
2. Rotate 90°
3. Span mode hiển thị viewport
4. Click zoom to main graph
5. Component tách riêng

**UAT Scenario UAT-MM-01**
- Steps: Mở minimap → Click Rotate 4 lần → Bật Span → Click vào minimap
- Pass Criteria: Rotate chính xác, coordinate mapping đúng, không delay

### 5.3 Filter Panel Wildcard — Story 3
**AC:**
1. Filter panel có input search trên cùng
2. Gõ text lọc checkbox realtime
3. Hỗ trợ wildcard * và ?
4. Checkbox hoạt động sau lọc
5. Component tách riêng

**UAT Scenario UAT-FL-01**
- Steps: Gõ `ACT*` → Kiểm tra list → Gõ `CLAS?` → Chọn checkbox → Kiểm tra graph filter
- Pass Criteria: Lọc đúng, realtime <200ms cảm nhận, không lỗi ReDoS

---

## 6. Pass/Fail Criteria

| Criteria | Pass Condition |
|----------|----------------|
| Functional | 100% UAT scenarios Pass |
| UX | Không có blocker về drag/resize/rotate |
| Regression | Các chức năng cũ vẫn hoạt động |
| Security | Không có lỗi XSS/postMessage lộ trong UAT |

Exit Criteria UAT: All scenarios Pass, PO sign-off trên UAT-CHECKLIST.md

---

## 7. Defect Management trong UAT

- Bug mới ghi vào Jira SA4E-247 với label `uat`
- Severity P1 block sign-off
- QA hỗ trợ reproduce, DEV fix trong 1 ngày

---

## 8. Sign-off Form

Form sign-off được đính kèm trong UAT-CHECKLIST.md cuối document.

---

## 9. Rủi ro & Mitigation

| Rủi ro | Mitigation |
|--------|------------|
| Người dùng không có thời gian | Lịch được chốt trước 2 ngày |
| Dữ liệu UAT không đại diện | Dùng pre-seeded data từ QA |
| Môi trường khác dev | Test trên production extension build |

---

## 10. Tài liệu liên quan

- BRD.md, FSD.md, TDD.md
- STP.md, STC.md
- TEST-REPORT.md
- UG.md
- UAT-CHECKLIST.md

---
*Prepared by QA Agent — QA không thay PO sign-off. Sign-off cuối cùng thuộc về PO/User.*
