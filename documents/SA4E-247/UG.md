# User Guide (UG)

## SDLC-Agents-4-Enterprise — SA4E-247: Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-247 |
| Title | Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-09-06 |
| Status | Final |
| Related BRD | documents/SA4E-247/BRD.md |
| Related FSD | documents/SA4E-247/FSD.md |
| Related TDD | documents/SA4E-247/TDD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0-draft | 2026-09-06 | DEV Agent | Initial document |
| 1.0 | 2026-09-06 | BA Agent | Review theo BRD/FSD, bổ sung hướng dẫn chi tiết Legend Window, Minimap Enhanced, Filter Panel với wildcard, cập nhật troubleshooting và examples. Phê duyệt Final |

---

## 1. Introduction

### 1.1 Purpose
User Guide mô tả cách sử dụng các component UI mới trong KB Graph Viewer: LegendWindow độc lập, MinimapController nâng cao, FilterPanel với FilterSearchInput wildcard. Tài liệu dành cho người dùng VS Code extension và quản trị viên.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| KB Graph User | Cách tương tác Legend, Minimap, Filter |
| System Administrator | Cấu hình localStorage, bảo trì UI |
| Developer | Tích hợp components |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| VS Code | 1.90+ | Yes |
| Node.js | 18+ | Yes |
| Extension SA4E | latest | Yes |

---

## 2. Getting Started

### 2.1 Quick Start
1. Mở VS Code
2. Mở panel KB Graph
3. LegendWindow hiển thị có thể kéo thả, resize
4. Minimap góc phải dưới hỗ trợ rotate/span
5. Filter panel có ô tìm kiếm wildcard

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Memory | 4GB | 8GB |
| Disk | 500MB | 1GB |
| OS | Windows 10 | Windows 11 / macOS |

### 2.3 Configuration Methods
UI state persisted in browser localStorage. Không cần cấu hình thủ công.
Key localStorage: `kb-graph.legend.window` lưu vị trí, kích thước, trạng thái maximize/minimize.

---

## 3. Configuration

### 3.1 Configuration Reference
Không có file config. State được lưu localStorage với key:
- `kb-graph.legend.window`

Reset state: đóng mở VS Code hoặc xóa localStorage key trong DevTools.

---

## 4. Usage

### 4.1 Legend Window
**Description:** Cửa sổ legend độc lập có thể drag, resize, maximize/minimize, scrollable.

**How to use:**
- Kéo titlebar để di chuyển vị trí trên workspace
- Kéo góc cửa sổ để resize theo chiều ngang/dọc
- Nhấn nút **Minimize** để thu nhỏ chỉ còn titlebar
- Nhấn nút **Maximize** để phóng to toàn màn hình; nhấn lại để khôi phục
- Cuộn trong LegendList để xem danh sách node types dài
- Legend tự động lưu vị trí/kích thước sau khi thay đổi; khôi phục sau reload

**Ví dụ thực tế:**
- Khi danh sách >100 types, bật scroll để duyệt nhanh
- Sử dụng Maximize khi cần xem chi tiết màu sắc và count

**Expected Output:** Vị trí/size được lưu sau reload. Nếu localStorage bị chặn, cửa sổ quay về vị trí mặc định góc trái dưới.

### 4.2 Minimap Controller
**Description:** Minimap với rotate 90°, span mode, click-to-zoom to main graph.

**How to use:**
- **Rotate:** Nhấn nút Rotate để xoay thumbnail 90° theo chiều kim đồng hồ. Nhấn 4 lần quay về gốc.
- **Span Toggle:** Bật Span để hiển thị khung màu vàng bao quanh vùng viewport hiện tại trong minimap.
- **Click-to-zoom:** Click vào vị trí bất kỳ trên minimap để zoom main graph tới vị trí đó.
- Minimap luôn phản ánh camera hiện tại của graph chính.

**Ví dụ thực tế:**
- Đang xem graph lớn, bật Span để định hướng vị trí đang xem
- Dùng Rotate khi layout graph bị lệch hướng
- Click nhanh vào vùng minimap để di chuyển tới khu vực quan tâm

**Expected Output:** Minimap phản hồi <200ms, rotate không làm sai lệch coordinate mapping.

### 4.3 Filter Panel with Wildcard Search
**Description:** Lọc node types realtime với wildcard * và ?.

**How to use:**
- Nhập text vào FilterSearchInput ở đầu Filter Panel
- Hỗ trợ wildcard: `*` khớp nhiều ký tự, `?` khớp 1 ký tự, không phân biệt hoa thường
- Danh sách checkbox được lọc ngay khi gõ, debounce 150ms
- Tích/bỏ tích checkbox để áp dụng filter lên graph
- Xóa text search để hiện lại toàn bộ danh sách

**Ví dụ:**
- Gõ `ACT*` → lọc ACTIVITY, ACTION, ACTOR...
- Gõ `*?ION` → khớp các type kết thúc bằng ...ION có ít nhất 1 ký tự trước
- Gõ `CLASS` → chỉ hiện checkbox CLASS

**Expected Output:** Graph cập nhật <200ms, filter realtime, checkbox vẫn hoạt động sau khi lọc.

---

## 5. User Interface Guide

### 5.1 Legend Window
- Titlebar draggable
- LegendList scrollable, virtualized cho >500 items
- Minimize/Maximize button trên titlebar
- State persisted in localStorage

### 5.2 Minimap Controller
- Canvas minimap scaled 1/10
- Rotate button 90°
- Span toggle hiển thị ZoomViewport rectangle
- Click event map to graph camera

### 5.3 Filter Panel
- FilterSearchInput với debounce 150ms
- Checkbox list filtered realtime theo wildcard
- Wildcard matcher chuyển pattern sang RegExp case-insensitive

---

## 6. Administration

### 6.1 Monitoring Health
Kiểm tra console webview cho lỗi localStorage quota hoặc canvas render.

### 6.2 Hot-Reload Configuration
Đóng mở VS Code để reset state. Để xóa state cục bộ, mở DevTools → Application → Local Storage → xóa key `kb-graph.legend.window`.

---

## 7. Troubleshooting

### 7.1 Common Issues
| Symptom | Cause | Solution |
|---------|-------|----------|
| Legend không nhớ vị trí | localStorage disabled hoặc full | Bật localStorage, xóa key cũ |
| Minimap không rotate | Graph chưa load hoặc canvas lỗi | Đợi graph render xong, reload panel |
| Filter chậm | Quá nhiều types >10k | Hạn chế wildcard phức tạp, chờ debounce |
| Legend rỗng | Không có node types | Đợi API /api/v1/admin/kb-graph/nodes/summary trả dữ liệu |

### 7.2 Error Codes
| Code | Message | Action |
|------|---------|--------|
| LS-01 | localStorage full | Xóa state cũ trong DevTools |
| LS-02 | localStorage unavailable | Sử dụng default position, báo người dùng bật storage |
| MAP-01 | Minimap init fail | Hide minimap UI, kiểm tra graph renderer |

---

## 8. API Reference

### 8.1 GET /api/v1/admin/kb-graph/nodes/summary
Lấy danh sách node types cho legend.

**Query Param:**
- `workspaceId` string required

**Response:**
```json
{ "types": [{"type":"ACTIVITY","count":1349,"color":"#3b82f6"}] }
```

**Error:** Empty dataset → hiển thị "No types".

---

## 9. Appendix

### 9.1 Glossary
| Term | Definition |
|------|------------|
| Legend | Bảng chú giải loại node |
| Minimap | Bản đồ thu nhỏ |
| Filter | Bộ lọc node types |

### 9.2 Related Documents
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-247/BRD.md |
| FSD | documents/SA4E-247/FSD.md |
| TDD | documents/SA4E-247/TDD.md |
| DPG | documents/SA4E-247/DPG.md |
