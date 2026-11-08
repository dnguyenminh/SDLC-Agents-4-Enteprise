# UAT-CHECKLIST.md — SA4E-406

## **Quick Reference Checklist cho UAT Tester**

> Dựa trên [UAT-READINESS.md](UAT-READINESS.md). Tick từng mục khi verify xong.

---

### **Detector Precision (AC-01 to AC-05)**

| # | Scenario | Test Case | Pass/Fail | Notes |
|---|----------|-----------|-----------|-------|
| 1 | Node Overlaps | File có overlap > 5% → detect `node_overlap` HIGH | ☐ | |
| 2 | Node Proximity | 2 node sibling 20px → detect `node_proximity` LOW | ☐ | |
| 3 | Child Outside Container | Child escape container bounds → detect `child_outside_container` HIGH | ☐ | |
| 4 | Diagonal Edges | Edge near 45° → detect `diagonal_edge` LOW | ☐ | |
| 5 | Edge Crossings | Edge crossing node/edge/container → detect `edge_crossing` HIGH | ☐ | |

---

### **Verify Loop (AC-06)**

| # | Scenario | Test Case | Pass/Fail | Notes |
|---|----------|-----------|-----------|-------|
| 6 | Fix → Re-detect | golden-deployment.drawio → fix → `remaining_issues` < original issues | ☐ | |
| 7 | XML Valid After Fix | File sau fix parse được, không lỗi XML | ☐ | |
| 8 | remaining_issues Match | `remaining_issues` count = actual issues sau re-detect | ☐ | |

---

### **ELK Compound Layout (AC-07, AC-08)**

| # | Scenario | Test Case | Pass/Fail | Notes |
|---|----------|-----------|-----------|-------|
| 9 | Hierarchical Containers | Nested containers layout đúng hierarchy | ☐ | |
| 10 | Algorithm: layered | Default algorithm chạy thành công | ☐ | |
| 11 | Algorithm: force | Force-directed layout chạy thành công | ☐ | |
| 12 | Algorithm: mrtree | Tree layout chạy thành công | ☐ | |
| 13 | Algorithm: radial | Radial layout chạy thành công | ☐ | |

---

### **Extension Migration (AC-09, AC-10)**

| # | Scenario | Test Case | Pass/Fail | Notes |
|---|----------|-----------|-----------|-------|
| 14 | drawio_auto_layout via bridge | Extension proxy → backend MCP → fix diagram | ☐ | |
| 15 | drawio_export_png via bridge | Extension proxy → export PNG thành công | ☐ | |

---

### **Remaining Issues & Path Resolution (AC-11, AC-12)**

| # | Scenario | Test Case | Pass/Fail | Notes |
|---|----------|-----------|-----------|-------|
| 16 | remaining_issues field | Response JSON có `remaining_issues: number` | ☐ | |
| 17 | base_dir resolution | `base_dir` + `workspace_root` resolve đúng path | ☐ | |

---

### **Security & Performance (AC-13, AC-14)**

| # | Scenario | Test Case | Pass/Fail | Notes |
|---|----------|-----------|-----------|-------|
| 18 | Path Traversal | `../../../etc/passwd` → reject với error rõ ràng | ☐ | |
| 19 | Max Nodes Limit | > MAX_NODES → error "Diagram too large" | ☐ | |
| 20 | ELK Timeout | Complex diagram + low timeout → error "Layout engine failed" | ☐ | |

---

## **Overall UAT Result"

| **Category** | **Total** | **Passed** | **Failed** | **Blocked** |
|--------------|-----------|------------|------------|-------------|
| Detector Precision | 5 | | | |
| Verify Loop | 3 | | | |
| ELK Compound Layout | 5 | | | |
| Extension Migration | 2 | | | |
| Remaining Issues & Path Resolution | 2 | | | |
| Security & Performance | 3 | | | |
| **TỔNG** | **20** | | | |

---

## **Sign-off"

**Tester**: ________________  
**Ngày**: ________________  
**Kết quả tổng thể**: ☐ PASS  ☐ FAIL  ☐ CONDITIONAL PASS  
**Ghi chú**: _________________________________________________  
**Chữ ký**: ________________