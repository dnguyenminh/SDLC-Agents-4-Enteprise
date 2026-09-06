# UAT Checklist — SA4E-247

## SDLC-Agents-4-Enterprise — Cải thiện UI KB Graph

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-247 |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-07 |

---

## 1. Preconditions

- [ ] Extension build RC đã cài đặt
- [ ] KB Graph panel mở được
- [ ] Dữ liệu node types sẵn sàng ≥50 types
- [ ] Người thực hiện đã đọc UG.md chương 4

---

## 2. Legend Window — Legend Window Independent

### UAT-LG-01: Cửa sổ độc lập hiển thị
**Story 1 AC-1**
- [ ] Legend hiển thị trong cửa sổ độc lập
- [ ] Title bar có nút Minimize / Maximize / Close
- **Expected:** Pass / Fail
- **Notes:**

### UAT-LG-02: Drag move & Resize
**Story 1 AC-2**
- [ ] Kéo title bar di chuyển cửa sổ
- [ ] Kéo góc resize thay đổi kích thước
- [ ] Reload trang → vị trí/kích thước được khôi phục
- **Expected:** Pass / Fail
- **Notes:**

### UAT-LG-03: Maximize/Minimize
**Story 1 AC-1**
- [ ] Click Maximize → cửa sổ full screen
- [ ] Click lại → khôi phục kích thước trước
- [ ] Click Minimize → chỉ còn title bar
- **Expected:** Pass / Fail
- **Notes:**

### UAT-LG-04: Scrollable content
**BR-02**
- [ ] Với >100 types, scrollbar xuất hiện
- [ ] Scroll mượt, không giật
- **Expected:** Pass / Fail
- **Notes:**

### UAT-LG-05: Empty state
- [ ] Khi không có dữ liệu → hiển thị "No types"
- **Expected:** Pass / Fail
- **Notes:**

---

## 3. Minimap Enhanced

### UAT-MM-01: Thumbnail & Rotate
**Story 2 AC-1,2**
- [ ] Minimap hiển thị thumbnail toàn bộ graph
- [ ] Click Rotate → xoay 90° theo chiều kim đồng hồ
- [ ] Click 4 lần → quay về gốc
- **Expected:** Pass / Fail
- **Notes:**

### UAT-MM-02: Span mode & Zoom to click
**Story 2 AC-3,4**
- [ ] Bật SpanToggle → khung viewport vàng hiển thị
- [ ] Click vào vị trí minimap → main graph zoom tới vị trí đó
- [ ] Sau rotate, click vẫn map đúng tọa độ
- **Expected:** Pass / Fail
- **Notes:**

---

## 4. Filter Panel Wildcard

### UAT-FL-01: Search input & realtime filter
**Story 3 AC-1,2**
- [ ] Filter panel có ô tìm kiếm trên cùng
- [ ] Gõ text → checkbox list lọc ngay lập tức
- [ ] Debounce cảm nhận <200ms
- **Expected:** Pass / Fail
- **Notes:**

### UAT-FL-02: Wildcard support
**BR-05**
- [ ] Gõ `ACT*` → hiện ACTIVITY, ACTION, ACTOR...
- [ ] Gõ `CLAS?` → hiện CLASSX, CLASSY
- [ ] Không phân biệt hoa thường
- **Expected:** Pass / Fail
- **Notes:**

### UAT-FL-03: Checkbox hoạt động sau lọc
**Story 3 AC-4**
- [ ] Sau khi lọc, tích checkbox vẫn áp dụng filter lên graph
- [ ] Xóa search → hiện lại toàn bộ list
- **Expected:** Pass / Fail
- **Notes:**

### UAT-FL-04: Edge cases
- [ ] Search empty → hiện tất cả
- [ ] Search pattern đặc biệt `ACT(.+)` → không lỗi, escape an toàn
- **Expected:** Pass / Fail
- **Notes:**

---

## 5. Regression & UX

- [ ] Pan/Zoom graph cũ vẫn hoạt động
- [ ] Không có lỗi console nghiêm trọng
- [ ] UI responsive trên màn hình 1280x720 trở lên

---

## 6. Sign-off

| Role | Name | Signature | Date | Comments |
|------|------|-----------|------|----------|
| Product Owner | Duc Nguyen Minh | ☐ |  |  |
| BA | BA Agent | ☐ |  |  |

**UAT Result:**
- [ ] Pass — All scenarios passed, ready for deployment
- [ ] Conditional Pass — Minor issues logged, can deploy with known issues
- [ ] Fail — Blocker found, need rework

**Decision by PO:** _________________________

---

## 7. UAT Data Reference

- Node types sample: ACTIVITY, ACTION, ACTOR, CLASS, CLASSX, CLASSY, DATA, RULE...
- Wildcard patterns tested: `ACT*`, `*ION`, `CLAS?`, `*`
- localStorage key: `kb-graph.legend.window`

---

*QA chuẩn bị checklist này. Việc đánh giá Pass/Fail và Sign-off cuối cùng thuộc về PO/User.*
