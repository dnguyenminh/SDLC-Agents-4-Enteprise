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
| Status | Draft |
| Related BRD | documents/SA4E-247/BRD.md |
| Related FSD | documents/SA4E-247/FSD.md |
| Related TDD | documents/SA4E-247/TDD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-06 | DEV Agent | Initial document |

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

---

## 3. Configuration

### 3.1 Configuration Reference
Không có file config. State được lưu localStorage với key:
- `kb-graph.legend.window`

---

## 4. Usage

### 4.1 Legend Window
**Description:** Cửa sổ legend độc lập có thể drag, resize, maximize/minimize.

**How to use:**
- Kéo titlebar để di chuyển
- Kéo góc để resize
- Nhấn Max để phóng to
- Cuộn để xem danh sách

**Expected Output:** Vị trí/size được lưu sau reload.

### 4.2 Minimap Controller
**Description:** Minimap với rotate 90°, span mode, click-to-zoom.

**How to use:**
- Nhấn Rotate để xoay 90°
- Bật Span để hiển thị viewport
- Click vào minimap để zoom

### 4.3 Filter Panel with Wildcard Search
**Description:** Lọc node types realtime với wildcard * và ?.

**How to use:**
- Gõ `ACT*` để lọc ACTIVITY, ACTION
- Gõ `*?ION` để khớp các type kết thúc
- Tích checkbox để áp dụng filter

**Expected Output:** Graph cập nhật <200ms.

---

## 5. User Interface Guide

### 5.1 Legend Window
- Titlebar draggable
- LegendList scrollable
- Minimize/Maximize button

### 5.2 Minimap Controller
- Canvas minimap
- Rotate button
- Span toggle

### 5.3 Filter Panel
- FilterSearchInput với debounce 150ms
- Checkbox list filtered realtime

---

## 6. Administration

### 6.1 Monitoring Health
Kiểm tra console webview cho lỗi localStorage quota.

### 6.2 Hot-Reload Configuration
Đóng mở VS Code để reset state.

---

## 7. Troubleshooting

### 7.1 Common Issues
| Symptom | Cause | Solution |
|---------|-------|----------|
| Legend không nhớ vị trí | localStorage disabled | Bật localStorage |
| Minimap không rotate | Graph chưa load | Đợi graph render |
| Filter chậm | Quá nhiều types | Giảm debounce |

### 7.2 Error Codes
| Code | Message | Action |
|------|---------|--------|
| LS-01 | localStorage full | Xóa state cũ |

---

## 8. API Reference

### 8.1 GET /api/v1/admin/kb-graph/nodes/summary
Lấy danh sách node types cho legend.

**Response:**
```json
{ "types": [{"type":"ACTIVITY","count":1349,"color":"#3b82f6"}] }
```

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
