# Yêu cầu: Không zoom vào được các cụm node ở xa — camera controls 2D không hợp dữ liệu 3D

## Triệu chứng
Các node phân bố thành nhiều cụm cầu (Fibonacci sphere) trong không gian 3D. Khi người dùng
zoom (cuộn chuột) tới một cụm nằm **xa gốc toạ độ theo trục Z**, camera **dừng lại và không tiến
vào cụm được nữa** — cụm vẫn nhỏ/ở xa dù đã zoom hết cỡ.

## Root cause (đã đọc code, xác nhận)
File điều khiển camera: `backend/src/viewer/admin/map-controls.js` (class `MapControls`).
File renderer: `backend/src/viewer/admin/kb-graph-renderer.js`.

`MapControls` là điều khiển **2D map-style, camera KHOÁ top-down theo trục Z**:

1. Mỗi frame, `MapControls.update()` ép:
   ```js
   this.camera.position.x = this.target.x;
   this.camera.position.y = this.target.y;
   this.camera.up.set(0, 1, 0);
   this.camera.lookAt(this.target);
   ```
   → Camera luôn nằm thẳng trên `target` theo trục Z, chỉ nhìn xuống.

2. **Zoom = giảm `camera.position.z`** (khoảng cách theo trục Z tới mặt phẳng z=0), clamp
   `[MIN_DISTANCE=1, MAX_DISTANCE=50000]`:
   ```js
   var targetZ = this._clamp(currentZ * factor);  // _handleWheel
   ```

3. `_screenToWorld` / `_applyZoomToward` giả định **thế giới phẳng ở z=0**: dùng
   `halfH = tan(fov/2) * camera.position.z` (coi position.z là khoảng cách tới mặt phẳng).
   Không hề tính `target.z`.

**Mâu thuẫn:** Backend (SA4E-97) đặt node trên **Fibonacci sphere 3D** — node có toạ độ Z trải
rộng (bán kính ~800–1500), KHÔNG nằm ở mặt phẳng z=0. Một cụm ở xa có `z` lớn. Khi zoom, camera
chỉ hạ `position.z` về phía 0, nên:
- Nếu cụm ở `z ≈ 1000`, camera hạ `z` từ 3500 → 1 vẫn **không tới được** vùng node (node ở phía
  trước/xung quanh theo Z), chỉ "trượt" qua mặt phẳng z=0 trống rỗng.
- `focusNode()` (double-click) có set `controls.target = node` (gồm `node.z`) và đặt camera gần
  node, NHƯNG `update()` ngay lập tức ghi đè `camera.x/y = target.x/y` và wheel-zoom tiếp theo lại
  kéo `position.z` về 0 theo mô hình phẳng → focus không bền, zoom vẫn sai.

Tóm lại: **mô hình điều khiển 2D (dolly theo trục Z tới mặt phẳng z=0) không tương thích dữ liệu
3D (node rải trên mặt cầu).**

## Mục tiêu
Cho phép người dùng **zoom/tiến vào bất kỳ cụm node nào trong không gian 3D**, tới sát để xem chi
tiết, ở mọi vị trí (kể cả cụm xa gốc theo Z).

## Hai hướng giải pháp — chọn Hướng A (khuyến nghị)

### Hướng A (KHUYẾN NGHỊ): Dolly theo hướng nhìn trong 3D (giữ dữ liệu 3D)
Chuyển zoom từ "giảm position.z" sang **dời camera dọc theo vector (camera → target) trong 3D**,
và cho phép `target` là điểm 3D bất kỳ.

Yêu cầu sửa `MapControls` (hoặc thay bằng orbit-style controls) sao cho:

1. **`target` là Vector3 3D thực sự** (đã là Vector3, nhưng logic hiện coi z=0). Bỏ giả định
   z=0 ở `_screenToWorld`, `_applyZoomToward`.

2. **Zoom = thay đổi khoảng cách `dist = |camera.position - target|`**, rồi đặt lại camera:
   ```
   dir = normalize(camera.position - target)
   dist = clamp(dist * factor, minDistance, maxDistance)
   camera.position = target + dir * dist
   ```
   KHÔNG ép `camera.position.x/y = target.x/y` nữa (bỏ khoá top-down), để camera có thể tiến sâu
   theo hướng nhìn.

3. **Zoom-toward-cursor trong 3D (tùy chọn nhưng nên có):** khi cuộn, dịch `target` một chút về
   phía điểm dưới con trỏ (raycast ra world tại độ sâu target) để zoom "hút" về nơi con trỏ trỏ,
   giống bản 2D hiện tại nhưng đúng 3D.

4. **Pan** dịch `target` trong mặt phẳng vuông góc hướng nhìn (dùng camera right/up vectors) thay
   vì chỉ x/y thế giới.

5. **Rotate/orbit (nên có):** cho phép xoay quanh `target` để nhìn cụm từ nhiều phía (dữ liệu là
   cầu 3D). Nếu giữ top-down thuần thì vẫn phải bỏ khoá dolly-theo-Z để zoom được.

6. `focusNode()` / double-click: set `target = node.position (3D)`, `dist` nhỏ (ví dụ 150–250),
   `camera.position = target + dir*dist`. Sau đó controls KHÔNG được ghi đè ngược.

7. Cập nhật `_screenToWorld` để chiếu tại mặt phẳng đi qua `target` vuông góc hướng nhìn (dùng
   khoảng cách `dist`, không dùng `position.z`).

### Hướng B (KHÔNG khuyến nghị): Ép layout về 2D (z=0)
Chiếu toàn bộ node về mặt phẳng z=0 ở tầng render/positions. Khi đó controls 2D hiện tại hoạt
động. **Nhược điểm:** vứt bỏ clustering 3D Fibonacci sphere (SA4E-97) — mất chiều sâu phân cụm,
các cụm chồng lên nhau khi ép phẳng. Chỉ chọn nếu quyết định bỏ hẳn 3D.

## Ràng buộc & tương thích (bắt buộc)
1. **LOD budget-driven vừa refactor phải tiếp tục hoạt động.** `_updateDetailLOD` dùng
   `controls.target` làm tâm chọn node gần nhất — sau khi target là 3D thật, cần chắc chắn target
   phản ánh đúng nơi camera đang nhìn (để chọn đúng cụm gần).
2. **Sphere pixel-scaling giữ nguyên** (đã đúng): dùng `distCam = |node - camera.position|` 3D.
3. **Picking (click chọn node)** phải vẫn đúng sau khi camera không còn khoá top-down (raycast từ
   camera qua con trỏ — vốn đã đúng, chỉ cần camera/matrix cập nhật chuẩn).
4. **Minimap** hiện vẽ theo x/y (top-down). Nếu bỏ khoá top-down, minimap có thể cần chỉ chiếu
   x/y như bản đồ khái quát — chấp nhận, không cần khớp 100% góc nhìn 3D.
5. Giữ API công khai của controls đang được renderer gọi: `update(dt)`, `target`, `zoomTo`,
   `panTo`, `dispose`, `onZoomEnd`, `onTap`, `onDoubleTap`, `raycastNode`, node-drag callbacks.
6. Không phá double-click focus, wheel zoom, pinch zoom (touch), pan inertia hiện có — chuyển
   chúng sang mô hình 3D tương đương.

## KHÔNG nằm trong phạm vi
- Không đổi thuật toán layout ở backend (giữ Fibonacci sphere 3D).
- Không đổi màu/legend/nền.
- Không đổi logic chọn budget của LOD (chỉ đảm bảo target 3D đúng).

## Kiểm thử (thủ công trong webview, WebGL)
1. **Zoom cụm xa:** cuộn chuột tới một cụm nằm xa gốc → camera tiến vào được tới sát node, node
   phóng to rõ, KHÔNG bị dừng giữa chừng.
2. **Zoom mọi cụm:** thử ≥3 cụm ở các vị trí/độ sâu Z khác nhau → đều vào được.
3. **Double-click focus:** double-click 1 node ở cụm xa → camera bay tới đúng node, giữ ổn định,
   zoom tiếp/ra vẫn quanh node đó.
4. **Pan:** kéo để pan → dịch chuyển vùng nhìn mượt, không giật về gốc.
5. **Zoom-out:** cuộn ngược → thấy toàn cảnh các cụm; node không biến mất (min-size vẫn hiệu lực).
6. **Picking:** click node ở cụm bất kỳ → panel chi tiết mở đúng node.
7. **LOD:** khi vào sát 1 cụm, các node cụm đó lên chi tiết (sphere), cụm khác xa vẫn dạng điểm.
8. **Không regression:** không lỗi console; `node --check map-controls.js` + `kb-graph-renderer.js`
   pass.

## Definition of Done
- [ ] Zoom vào được cụm node ở mọi vị trí 3D (không còn bị chặn bởi mô hình dolly-theo-Z).
- [ ] `target` là điểm 3D thật; bỏ giả định thế giới phẳng z=0 trong `_screenToWorld`/zoom.
- [ ] Zoom = thay đổi khoảng cách camera↔target dọc hướng nhìn (clamp min/max distance hợp lý).
- [ ] `focusNode`/double-click tới đúng node 3D và ổn định (controls không ghi đè ngược).
- [ ] Pan/rotate (nếu thêm) hoạt động quanh target 3D.
- [ ] LOD budget-driven + sphere pixel-scaling + picking vẫn đúng.
- [ ] `node --check` pass cho cả 2 file; test thủ công theo mục Kiểm thử đạt.
- [ ] Tuân thủ code-standards (hàm ≤ 20 dòng nếu tách được, comment WHY cho toán học camera,
      không nuốt exception).

## Ghi chú tham chiếu (cho người thực hiện)
- Camera: `PerspectiveCamera(fov=60, near=0.1, far=100000)`, khởi tạo `position=(0,0,3500)`.
- `MapControls` hằng số: `WHEEL_ZOOM_FACTOR=1.15`, `MIN_DISTANCE=1`, `MAX_DISTANCE=50000`.
- Node layout: Fibonacci sphere 3D (radius ~800–1500 tùy service), node.z ≠ 0.
- Chỗ ép top-down cần bỏ: cuối `MapControls.prototype.update` (ghi đè camera.x/y + lookAt).
- Chỗ zoom cần đổi: `_handleWheel`, `_applyZoomToward`, `_applyPinchZoom`, `_screenToWorld`,
  `_clamp` (đang clamp theo position.z; đổi sang clamp theo distance camera↔target).
- Renderer gọi controls: `focusNode`, `zoomToFit` (xem hàm quanh dòng 250–276 trong renderer),
  `_updateDetailLOD` dùng `controls.target`.
