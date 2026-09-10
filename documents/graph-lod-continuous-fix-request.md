# Yêu cầu: Thay LOD 3-mode cứng (FAR/MID/CLOSE) bằng LOD liên tục theo ngân sách

## Bối cảnh
KB Graph render bằng renderer Three.js tự viết: `backend/src/viewer/admin/kb-graph-renderer.js`
(class `KBGraphRendererImpl`). Đây là luồng đang chạy thực tế (server phục vụ file trong
`backend/src/viewer/admin/`, chạy qua `tsx watch src/index.ts`).

Renderer đã có sẵn:
- Lớp nền: toàn bộ node là `THREE.Points` dùng **custom ShaderMaterial** với kích thước điểm
  được clamp `[uMinPx, uMaxPx]` (min ~7 CSS px) → node không bao giờ nhỏ dưới ngưỡng mắt thấy dù
  zoom xa. (Đã làm, giữ nguyên.)
- Lớp chi tiết: state machine 3 mode rời rạc trong `_updateMode()`.

## Vấn đề cần giải quyết
Cơ chế LOD hiện tại dùng **3 mode rời rạc** với **ngưỡng khoảng cách cứng** và **số node cứng**:

```js
const FAR_THRESHOLD = 800;      // dist > 800  -> FAR
const MID_THRESHOLD = 300;      // 300..800    -> MID
const INSTANCED_RADIUS = 400;   // bán kính thu nhận cho MID
const CLOSE_NODE_COUNT = 500;   // CLOSE: 500 node gần nhất
// _setupMidMode: maxInstanced = 2000 (hằng số nội hàm)
```

`_updateMode(force)`:
```js
var dist = this._getCameraDistance();     // camera.position.distanceTo(controls.target)
if (dist > FAR_THRESHOLD) newMode = 'FAR';
else if (dist > MID_THRESHOLD) newMode = 'MID';
else newMode = 'CLOSE';
```

Hạn chế:
1. **Không co giãn theo số lượng node.** Ngưỡng 300/800 và count 500/2000 là hằng số tuyệt đối.
   Khi đồ thị có rất nhiều node (mục tiêu: hàng chục nghìn → hàng trăm nghìn), các ngưỡng này
   không còn hợp lý: hoặc quá tải (dựng quá nhiều sphere), hoặc thấy quá ít.
2. **Chuyển mode giật cục (cliff).** Vượt ngưỡng là đổi mode ngay → node chi tiết xuất hiện/biến
   mất đột ngột, không mượt.
3. **"Khoảng cách tới target" không phản ánh mật độ hiển thị thực tế** trên màn hình (phụ thuộc
   fov, viewport, phân bố node).

## Mục tiêu
Thay 3 mode rời rạc bằng **một logic LOD liên tục, điều khiển bằng ngân sách (budget-driven)**,
scale tốt khi số node lớn, không có cliff, và giữ hiệu năng (instanced rendering).

## Thiết kế yêu cầu (bắt buộc tuân theo)

### Nguyên lý: 2 lớp luôn tồn tại, lớp chi tiết chọn động theo budget
1. **Lớp nền (background points) — luôn bật, không đổi.**
   - Toàn bộ node vẽ bằng `pointsObject` (shader points min-size). Giữ nguyên.
   - Chỉ điều chỉnh `uniforms.uOpacity` theo mức chi tiết đang hiển thị (xem dưới).

2. **Lớp chi tiết (detail layer) — liên tục, chọn theo budget.**
   - Mỗi lần refresh (throttled ~150–200ms hoặc khi camera dừng di chuyển), chọn **tối đa
     `detailBudget` node GẦN TÂM NHÌN nhất** để nâng cấp thành **instanced spheres**.
   - `detailBudget` là **hằng số ngân sách** (mặc định 1500), **KHÔNG phụ thuộc khoảng cách** →
     đảm bảo hiệu năng ổn định bất kể tổng số node.
   - "Tâm nhìn" = `controls.target` (điểm camera đang nhìn vào). Sắp xếp node theo khoảng cách 3D
     tới target, lấy `detailBudget` node đầu.
   - **Bỏ hoàn toàn ngưỡng FAR/MID/CLOSE.** Không còn `currentMode`.

### Chi tiết phải liên tục (chống cliff)
- Số sphere hiển thị luôn là `min(detailBudget, tổng node)`. Khi camera di chuyển, tập node gần
  nhất thay đổi dần → sphere xuất hiện/biến mất theo thứ tự khoảng cách, không nhảy bậc.
- **Fade theo khoảng cách (khuyến nghị):** node chi tiết ở rìa tập budget nên mờ dần thay vì
  bật/tắt cứng. Có thể dùng `emissiveIntensity`/`opacity` giảm theo rank khoảng cách, hoặc
  giữ đơn giản ở bản đầu (chấp nhận) và ghi chú TODO.

### Kích thước sphere: theo pixel màn hình, không theo world cứng
- Sphere hiện tại scale theo `NODE_SIZES[type] * hằng_số` (world units) → khi zoom, sphere phình/
  co không kiểm soát. Yêu cầu: scale sphere sao cho **đường kính chiếu lên màn hình nằm trong một
  khoảng pixel hợp lý** (ví dụ 8–48 px), tương tự cách points đã clamp.
  - Công thức pixel↔world (perspective): `pixels = worldSize * viewportHeightPx / (2 * dist * tan(fov/2))`.
    Suy ra `worldSize = targetPixels * 2 * dist * tan(fov/2) / viewportHeightPx`.
  - Với mỗi node chi tiết, tính `dist` từ camera, chọn `targetPixels` theo `NODE_SIZES[type]`
    (map type-size 1.5..6 → ví dụ 10..40 px), rồi quy ra `worldSize` để set scale.
- Mục tiêu: sphere gần và xa đều có kích thước thấy được, không có sphere khổng lồ khi zoom sát.

### Labels: theo budget + ngưỡng pixel
- Chỉ hiển thị label cho node chi tiết có kích thước chiếu ≥ ngưỡng (ví dụ ≥ 14 px) VÀ giới hạn
  `labelBudget` (mặc định 30) để tránh rối. Chọn theo gần tâm nhất trước.
- Giữ cơ chế label DOM hiện có (`_showLabels` / `_updateLabels`), chỉ đổi cách chọn tập node.

### Opacity lớp nền theo mật độ chi tiết
- Khi có nhiều node chi tiết đang hiển thị (zoom sát, tập budget bao phủ phần lớn view) → giảm
  `uOpacity` lớp points (ví dụ 0.35) để sphere nổi lên.
- Khi ít/không có chi tiết (zoom rất xa, sphere phân tán) → tăng `uOpacity` (ví dụ 0.95).
- Có thể nội suy tuyến tính theo tỉ lệ `detailVisible / detailBudget`.

## Vị trí sửa (file & hàm)
File: `backend/src/viewer/admin/kb-graph-renderer.js`

Thay/loại bỏ:
- `_updateMode(force)` → thay bằng `_updateDetailLOD(force)` (logic liên tục ở trên).
- `_setupFarMode()`, `_setupMidMode()`, `_setupCloseMode()` → gộp thành 1 hàm dựng/cập nhật
  detail layer (ví dụ `_refreshDetailLayer()`), tái sử dụng 1 `InstancedMesh` duy nhất.
- Hằng số `FAR_THRESHOLD`, `MID_THRESHOLD`, `INSTANCED_RADIUS`, `CLOSE_NODE_COUNT` → thay bằng:
  ```js
  const DETAIL_BUDGET = 1500;   // số node tối đa nâng lên sphere (ngân sách hiệu năng)
  const LABEL_BUDGET = 30;      // số label tối đa
  const SPHERE_MIN_PX = 8;      // đường kính sphere tối thiểu trên màn hình
  const SPHERE_MAX_PX = 48;     // tối đa
  const LABEL_MIN_PX  = 14;     // ngưỡng pixel để hiện label
  const REFRESH_MS = 160;       // throttle cập nhật detail
  ```
  (Các hằng số này nên gom vào `options` để cấu hình được; xem "Cấu hình".)

Nơi gọi:
- Trong `_animate()` hiện đang gọi `_updateMode(false)` mỗi ~200ms và `_updateLabels()` khi CLOSE.
  Thay bằng gọi `_updateDetailLOD(false)` theo `REFRESH_MS`; luôn cập nhật label cho tập chi tiết.
- `controls.addEventListener('end', ...)`, `zoomToFit`, `focusNode`, `loadPositions` hiện gọi
  `_updateMode(true)` → đổi sang `_updateDetailLOD(true)`.

Tái sử dụng InstancedMesh:
- Tạo 1 `InstancedMesh(sphereGeo, MeshLambertMaterial{vertexColors}, DETAIL_BUDGET)` một lần
  (hoặc khi budget đổi), set `count` = số node chi tiết hiện tại mỗi refresh, cập nhật
  `instanceMatrix` + instance color, `instanceMatrix.needsUpdate = true`. Tránh dispose/tạo lại
  mỗi frame (đang là nguyên nhân giật ở code cũ).
- Lưu `userData.nodeIndices` (mảng index theo thứ tự instance) để raycast/picking ánh xạ đúng
  node — kiểm tra hàm picking hiện tại (click) vẫn hoạt động sau khi bỏ closeMeshes.

## Ràng buộc & tương thích (bắt buộc kiểm tra)
1. **Picking/click node:** hiện `_setupCloseMode` tạo `closeMeshes` (Mesh riêng, có
   `userData.nodeId`) phục vụ click. Sau khi chuyển sang InstancedMesh duy nhất, phải cập nhật
   cơ chế picking để lấy `instanceId` từ raycaster → map ra node qua `userData.nodeIndices`.
   Không được làm hỏng event `graph-node-click` (dùng bởi panel chi tiết trong `index.html`).
2. **Points nền vẫn là ShaderMaterial:** KHÔNG set `material.size`/`material.opacity` trực tiếp
   (đó là API của PointsMaterial cũ). Dùng `material.uniforms.uOpacity.value`. Có helper
   `_updatePointSizeUniforms()` đã tồn tại — giữ và gọi khi resize.
3. **Edges:** hiện FAR ẩn edges, MID/CLOSE hiện. Với LOD liên tục: hiển thị edges khi có lớp chi
   tiết đáng kể (ví dụ khi `uOpacity` nền đã giảm), hoặc luôn hiện nếu số edge nhỏ. Tránh
   "wireframe sphere" che node khi zoom rất xa (lý do cũ ẩn edges ở FAR).
4. **Không phụ thuộc ForceGraph3D.** Lưu ý repo có `lod-manager.js` + `lod-clustering.js` +
   `lod-animation.js` nhưng chúng viết cho `ForceGraph3D` (API `graph.graphData()`, `nodeVal`,
   `cameraPosition`) — KHÁC renderer đang dùng. **KHÔNG wire các file này vào** trừ khi làm phần
   clustering mở rộng (xem "Mở rộng tùy chọn"). Bản LOD liên tục này không cần chúng.
5. **Đồng bộ màu:** dùng `colorForType()` sẵn có; màu phải khớp legend trong `index.html`
   (`typeColor()`).

## Cấu hình (đưa hằng số ra options)
Cho phép override qua `options` khi tạo renderer (và có default an toàn):
```
detailBudget, labelBudget, sphereMinPx, sphereMaxPx, labelMinPx, refreshMs
```
Mục tiêu: khi số node rất lớn, có thể hạ `detailBudget` mà không sửa code lõi.

## Mở rộng tùy chọn (KHÔNG bắt buộc trong phạm vi này)
Khi số node cực lớn và người dùng zoom rất xa, có thể gom node thành **super-node đại diện**
(clustering) rồi tách dần khi zoom vào. Repo đã có thuật toán trong `lod-clustering.js`. Nếu làm:
- Chỉ kích hoạt clustering khi `tổng node > ngưỡng lớn` (ví dụ > 20k) và camera rất xa.
- Cần adapter để clustering ghép vào renderer Points/Instanced hiện tại (KHÔNG dùng ForceGraph3D).
- Đây là hạng mục riêng, tách khỏi DoD chính bên dưới.

## KHÔNG nằm trong phạm vi
- Không đổi màu nền/legend (đã xử lý ở thay đổi trước).
- Không đổi thuật toán layout vị trí node (Fibonacci sphere ở backend).
- Không sửa backend/API. Toàn bộ thay đổi nằm trong `kb-graph-renderer.js` (và nếu cần, chỗ khởi
  tạo options trong `index.html`).

## Kiểm thử (bắt buộc)
Renderer là JS thuần chạy trong webview; ưu tiên test thủ công + kiểm chứng bằng số liệu:
1. **Min-size:** zoom xa tối đa với 886 node → mọi node vẫn thấy (≥ ~7px), không có điểm biến mất.
2. **Liên tục:** di chuyển/zoom camera → sphere chi tiết xuất hiện/biến mất DẦN theo khoảng cách,
   không có thời điểm "nhảy" toàn bộ mode.
3. **Budget:** với dataset lớn (giả lập 20k–100k node — có thể nhân bản positions để test), số
   sphere đồng thời không vượt `detailBudget`; FPS ổn định (không tụt mạnh khi zoom).
4. **Sphere pixel size:** zoom sát 1 node → sphere không phình quá `SPHERE_MAX_PX`; zoom xa →
   sphere không nhỏ hơn `SPHERE_MIN_PX`.
5. **Labels:** số label ≤ `LABEL_BUDGET`; chỉ hiện cho node đủ lớn; không chồng chéo dày đặc.
6. **Picking:** click 1 node (cả gần lẫn khi là instanced) → panel chi tiết mở đúng node
   (event `graph-node-click` bắn đúng `node.id`).
7. **Resize:** đổi kích thước cửa sổ → kích thước points & sphere pixel giữ đúng (gọi lại
   `_updatePointSizeUniforms` + tái tính sphere scale).
8. **Regression:** node count không đổi; edges nối đúng; không lỗi console; không leak (InstancedMesh
   tái sử dụng, không tạo/dispose mỗi frame).

## Definition of Done
- [ ] Bỏ hẳn `_updateMode` + 3 hàm setup mode + 4 hằng số ngưỡng cứng.
- [ ] Có `_updateDetailLOD` + `_refreshDetailLayer` chọn `detailBudget` node gần tâm nhất, dùng 1
      InstancedMesh tái sử dụng.
- [ ] Sphere scale theo pixel màn hình (clamp `[SPHERE_MIN_PX, SPHERE_MAX_PX]`).
- [ ] Chi tiết xuất hiện/biến mất liên tục, không cliff.
- [ ] Opacity lớp points nền nội suy theo mật độ chi tiết (dùng uniform).
- [ ] Labels giới hạn theo `labelBudget` + ngưỡng pixel.
- [ ] Picking/click vẫn đúng qua InstancedMesh (`instanceId` → node).
- [ ] Các hằng số cấu hình được qua `options` với default hợp lý.
- [ ] Không dùng `.size`/`.opacity` trên ShaderMaterial; chỉ dùng uniforms.
- [ ] Không dùng ForceGraph3D / lod-manager.js (trừ hạng mục clustering mở rộng, ngoài phạm vi).
- [ ] `node --check backend/src/viewer/admin/kb-graph-renderer.js` pass; test thủ công theo mục
      "Kiểm thử" đạt.
- [ ] Tuân thủ code-standards (hàm ≤ 20 dòng nếu tách được, comment WHY cho công thức pixel↔world,
      không nuốt exception).

## Ghi chú tham chiếu (cho người thực hiện)
- Camera mặc định: `PerspectiveCamera(fov=60, near=0.1, far=100000)`, khởi tạo tại z=3500.
- `controls.target` là tâm nhìn (OrbitControls-like trong `map-controls.js`).
- Helper pixel đã có: `_updatePointSizeUniforms()` tính `uPxPerWorld = viewportHeightPx /
  (2*tan(fov/2))` — có thể tái dùng cùng công thức cho sphere.
- `NODE_SIZES` (type → base size 1.5..6) và `colorForType()` đã có sẵn ở đầu file.
- Event picking hiện tại: xem hàm xử lý click/raycast trong renderer (tìm `graph-node-click`,
  `_dispatchNodeClick`, raycaster) để cập nhật cho InstancedMesh.
