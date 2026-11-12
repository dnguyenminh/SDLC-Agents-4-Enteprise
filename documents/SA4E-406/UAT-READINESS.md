# UAT-READINESS.md — SA4E-406

## **Tiêu đề**
User Acceptance Test Readiness — drawio_auto_layout: Detector Precision + Verify Loop + ELK Compound + Extension Migration

## **Mô tả**
Tài liệu này xác nhận tính sẵn sàng cho User Acceptance Testing (UAT) của ticket SA4E-406. Tất cả các tiêu chí chấp nhận từ BRD đã được verify qua automated testing.

---

## **Thông tin chung**
- **Ticket**: SA4E-406
- **Ngày tạo**: 2026-11-08
- **Phiên bản**: 1.1
- **Trạng thái**: Sẵn sàng cho UAT
- **Environment**: Staging / Local development
- **Merge Commit**: 3061986b

---

## **Các tiêu chí chấp nhận từ BRD (Acceptance Criteria)**

| **AC ID** | **Tiêu chí** | **Nguồn** | **Trạng thái Auto-test** | **Cần verify UAT** |
|-----------|--------------|-----------|-------------------------|---------------------|
| AC-01 | Detector precision: node overlap detection với OVERLAP_EPS=0.05 (5%) | BRD §X, UC-1 | ✅ Passed (TC-001, TC-002) | ✅ Cần verify |
| AC-02 | Detector precision: node proximity với MIN_GAP=40px | BRD §X, UC-1 | ✅ Passed (TC-003) | ✅ Cần verify |
| AC-03 | Detector precision: child outside container với CONTAINMENT_TOL=5px | BRD §X, UC-1 | ✅ Passed (TC-004) | ✅ Cần verify |
| AC-04 | Detector precision: diagonal edges detection (tolerance 20px) | BRD §X, UC-1 | ✅ Passed (TC-005) | ✅ Cần verify |
| AC-05 | Detector precision: edge crossings (node, edge-edge, container) | BRD §X, UC-1 | ✅ Passed (TC-006) | ✅ Cần verify |
| AC-06 | Verify loop: fix → re-parse → re-detect remaining issues | BRD §Y, UC-2 | ✅ Passed (Golden Tests) | ✅ Cần verify |
| AC-07 | ELK compound layout: hierarchical container layout support | BRD §Z, UC-3 | ✅ Passed (TC-007, TC-008) | ✅ Cần verify |
| AC-08 | ELK algorithms: layered, force, mrtree, radial support | BRD §Z, UC-3 | ✅ Passed (TC-009) | ✅ Cần verify |
| AC-09 | Extension migration: drawio_auto_layout tool available via MCP bridge | BRD §W, UC-4 | ✅ Passed (E2E Tests) | ✅ Cần verify |
| AC-10 | Extension migration: drawio_export_png tool available via MCP bridge | BRD §W, UC-4 | ✅ Passed (E2E Tests) | ✅ Cần verify |
| AC-11 | Remaining issues tracking: trả về `remaining_issues` count sau fix | BRD §V, UC-5 | ✅ Passed (TC-010) | ✅ Cần verify |
| AC-12 | Multi-worktree path resolution (SA4E-394) for drawio tools | BRD §U, UC-6 | ✅ Passed (TC-011) | ✅ Cần verify |
| AC-13 | Security: path traversal prevention (SEC-01: CWE-22) | BRD §Security | ✅ Passed (TC-012) | ✅ Cần verify |
| AC-14 | Performance: ELK timeout 10s, max 500 nodes (configurable) | BRD §Perf | ✅ Passed (TC-013) | ✅ Cần verify |

---

## **Test Results Summary**

| **Test Level** | **Total** | **Passed** | **Failed** | **Blocked** |
|----------------|-----------|------------|------------|-------------|
| Unit Testing (detect, repair, geometry, parser, writer) | 12 | 12 | 0 | 0 |
| Golden Tests (deployment + sequence diagrams) | 4 | 4 | 0 | 0 |
| Integration Tests (apply, export-png) | 3 | 3 | 0 | 0 |
| E2E Tests (extension MCP bridge) | 2 | 2 | 0 | 0 |
| **Tổng cộng** | **21** | **21** | **0** | **0** |

*Chi tiết: Xem [TEST-REPORT.md](documents/SA4E-406/TEST-REPORT.md)*

---

## **UAT Test Scenarios**

### **Scenario 1: Detector Precision — Node Overlaps**
**Mục tiêu**: Verify detector phát hiện node overlaps chính xác với threshold 5%
**Steps**:
1. Chuẩn bị file `.drawio` có node overlap rõ ràng (> 5% diện tích)
2. Gọi tool `drawio_auto_layout` qua MCP bridge hoặc backend:
   ```json
   {
     "file_path": "test-overlaps.drawio",
     "algorithm": "layered",
     "spacing": 80
   }
   ```
3. **Expected**: Trả về `status: "fixed"`, `remaining_issues` < số issues ban đầu, file được fix

### **Scenario 2: Detector Precision — Node Proximity**
**Mục tiêu**: Verify detector cảnh báo node quá gần nhau (< 40px)
**Steps**:
1. Chuẩn bị file `.drawio` có 2 node sibling cách nhau 20px
2. Gọi tool `drawio_auto_layout`
3. **Expected**: Phát hiện `node_proximity` severity LOW (không auto-fix, chỉ cảnh báo)

### **Scenario 3: Detector Precision — Child Outside Container**
**Mục tiêu**: Verify detector phát hiện child escape khỏi container
**Steps**:
1. Chuẩn bị file `.drawio` có child node nằm ngoài bounds của container
2. Gọi tool `drawio_auto_layout`
3. **Expected**: Phát hiện `child_outside_container` severity HIGH, fix bằng cách clamp child vào container hoặc resize container

### **Scenario 4: Verify Loop — Fix → Re-detect**
**Mục tiêu**: Verify vòng lặp verify: fix xong → re-parse → re-detect remaining issues
**Steps**:
1. Dùng file `documents/SA4E-406/diagrams/deployment.drawio` (thay thế fixture `golden-deployment.drawio` đã bị xóa)
2. Gọi tool `drawio_auto_layout`
3. **Expected**: 
   - `status: "fixed"` hoặc `"partially_fixed"`
   - `remaining_issues` là số nguyên ≥ 0
   - File sau fix vẫn parse được (XML valid)
   - Số issues sau fix khớp với `remaining_issues`

### **Scenario 5: ELK Compound Layout — Hierarchical Containers**
**Mục tiêu**: Verify ELK layout hierarchical containers đúng
**Steps**:
1. Dùng file deployment diagram có nested containers
2. Gọi tool với `algorithm: "layered"`, `direction: "DOWN"`
3. **Expected**: Containers được layout theo hierarchy, children nằm trong bounds của parent

### **Scenario 6: ELK Algorithms — Multiple Algorithm Support**
**Mục tiêu**: Verify 4 algorithms: layered, force, mrtree, radial
**Steps**:
1. Test từng algorithm trên cùng một file:
   ```json
   { "file_path": "test.drawio", "algorithm": "force" }
   { "file_path": "test.drawio", "algorithm": "mrtree" }
   { "file_path": "test.drawio", "algorithm": "radial" }
   ```
3. **Expected**: Tất cả chạy không lỗi, produce layout khác nhau phù hợp algorithm

### **Scenario 7: Extension Migration — drawio_auto_layout via MCP Bridge**
**Mục tiêu**: Verify tool có sẵn qua extension MCP bridge
**Steps**:
1. Khởi động backend MCP server (port 9183)
2. Kết nối extension proxy
3. Gọi tool qua bridge:
   ```typescript
   await bridge.callTool('execute_dynamic_tool', {
     toolName: 'drawio_auto_layout',
     arguments: { file_path: 'documents/SA4E-124/diagrams/arch.drawio' }
   })
   ```
4. **Expected**: Trả về kết quả fix thành công, file được cập nhật

### **Scenario 8: Extension Migration — drawio_export_png via MCP Bridge**
**Mục tiêu**: Verify export PNG qua extension MCP bridge
**Steps**:
1. Gọi tool qua bridge:
   ```typescript
   await bridge.callTool('execute_dynamic_tool', {
     toolName: 'drawio_export_png',
     arguments: { 
       file_path: 'documents/SA4E-124/diagrams/arch.drawio',
       output_path: 'documents/SA4E-124/diagrams/arch.png'
     }
   })
   ```
2. **Expected**: File PNG được tạo, không lỗi

### **Scenario 9: Remaining Issues Tracking**
**Mục tiêu**: Verify response chứa `remaining_issues` count
**Steps**:
1. Gọi `drawio_auto_layout` trên file có issues
2. **Expected**: JSON response có field `remaining_issues` là number (0, 1, 2...)

### **Scenario 10: Multi-worktree Path Resolution**
**Mục tiêu**: Verify base_dir/workspace_root path resolution
**Steps**:
1. Gọi tool với `base_dir` parameter:
   ```json
   {
     "file_path": "diagrams/arch.drawio",
     "base_dir": "/path/to/worktree",
     "workspace_root": "/path/to/main/repo"
   }
   ```
2. **Expected**: Path được resolve đúng qua shared resolver, không bị reject

### **Scenario 11: Security — Path Traversal Prevention**
**Mục tiêu**: Verify path traversal bị chặn
**Steps**:
1. Gọi tool với path escape: `file_path: "../../../etc/passwd"`
2. **Expected**: Trả về error `Path rejected: ... outside backend workspace`

### **Scenario 12: Performance — ELK Timeout & Node Limits**
**Mục tiêu**: Verify configurable limits hoạt động
**Steps**:
1. Test với diagram > 500 nodes (hoặc set env `SA4E_ELK_MAX_NODES=10`)
2. **Expected**: Trả về error `Diagram too large` thay vì crash/timeout
3. Test timeout: set env `SA4E_ELK_TIMEOUT_MS=100` với complex diagram
4. **Expected**: Trả về error `Layout engine failed` trong timeout

---

## **Environment Setup cho UAT"

### **Prerequisites**
- [ ] Docker và Docker Compose đã cài đặt
- [ ] Node.js v22.x
- [ ] Backend dependencies: `npm install` ở root và `backend/`
- [ ] Extension dependencies: `npm install` ở `extension/`
- [ ] PostgreSQL database accessible (cho backend)

### **Quick Start Commands**
```bash
# 1. Start backend MCP server
cd backend
npm run build
CODE_INTEL_PORT=9183 CODE_INTEL_WORKSPACE=/path/to/workspace npx tsx src/index.ts &

# 2. Verify server health
curl http://localhost:9183/health

# 3. Run extension E2E test (optional)
cd extension
npm run test:e2e:drawio

# 4. Manual test drawio_auto_layout
curl -X POST http://localhost:9183/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "execute_dynamic_tool",
      "arguments": {
        "toolName": "drawio_auto_layout",
        "arguments": { "file_path": "documents/SA4E-406/diagrams/deployment.drawio" }
      }
    },
    "id": 1
  }'
```

### **Test Fixtures Available**
- `documents/SA4E-406/diagrams/deployment.drawio` — deployment diagram với overlaps thật (thay thế `golden-deployment.drawio` đã bị xóa)
- `documents/SA4E-406/diagrams/sequence-verify-loop.drawio` — sequence diagram với layout sạch (thay thế `golden-sequence.drawio` đã bị xóa)
- `documents/SA4E-124/diagrams/*.drawio` — diagrams thực tế cho extension test

---

## **Known Limitations / Out of Scope**

| **Item** | **Lý do** | **Ghi chú** |
|----------|-----------|-------------|
| Real-time collaborative editing | Không trong scope ticket này | Future enhancement |
| WebSocket streaming for layout progress | Backend không có WebSocket layer | Infrastructure concern |
| Authentication/Authorization | MCP server không có auth layer | Deploy concern |
| Custom ELK layout options beyond algorithm/spacing/direction | Giữ API đơn giản | Có thể extend sau |

---

## **Sign-off"

### **QA Sign-off**
- **Tester**: QA Agent
- **Ngày**: 2026-11-08
- **Kết quả**: All automated tests PASSED (21/21)
- **Chữ ký**: ✅

### **Product Owner / User UAT Sign-off** ⏳ **CHỜ XÁC NHẬN**
- **Người test**: [Product Owner / User]
- **Ngày**: [Điền khi test xong]
- **Kết quả**: [PASS / FAIL / CONDITIONAL PASS]
- **Ghi chú**: [Các issue phát hiện, nếu có]
- **Chữ ký**: [⏳ CHỜ]

---

## **Lịch sử thay đổi**
- **2026-11-08**: Tạo UAT-READINESS.md ban đầu. Sẵn sàng cho UAT gate.
- **2026-11-12**: Cập nhật tham chiếu test fixtures bị xóa: `golden-deployment.drawio` → `documents/SA4E-406/diagrams/deployment.drawio`, `golden-sequence.drawio` → `documents/SA4E-406/diagrams/sequence-verify-loop.drawio` (sau khi legacy backend engine fixtures bị xóa). Bump phiên bản 1.0 → 1.1.

---

## **Hành động tiếp theo**

⚠️ **SM L3 AUTONOMY GATE**: Pipeline đang DỪNG tại Phase 6.5 (UAT).

**Cần xác nhận từ User/Product Owner trước khi chuyển sang Phase 7 (Deployment):**

```
User vui lòng confirm một trong sau:
1. "UAT PASS" — Tiếp tục Phase 7 (Deployment)
2. "UAT FAIL: <lí do>" — Quay lại IN PROGRESS để fix
3. "UAT CONDITIONAL: <điều kiện>" — Fix điều kiện rồi re-UAT
```

**Không được tự động chuyển sang Deployment mà không có xác nhận rõ ràng từ User.**