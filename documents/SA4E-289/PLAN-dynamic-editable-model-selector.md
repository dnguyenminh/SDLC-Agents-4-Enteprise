# PLAN — Dynamic + Editable Model Selector (SDLC Pipeline Extension)

> **Cho AI thực thi:** Đây là plan chi tiết. Đọc kỹ phần "Bối cảnh" trước khi sửa. Mọi đường dẫn/line number lấy từ khảo sát codebase thực tế. KHÔNG sửa file trong `extension/out/` (là build output) — chỉ sửa `src/` và `webview-assets/`, rồi build lại.

---

## 1. Mục tiêu (Option C)

Sửa ô **"Model"** trong Settings panel của extension "SDLC Pipeline" để:

1. **Load động** danh sách model từ gateway OpenAI-compatible endpoint `GET {baseUrl}/v1/models` (thay vì list cứng GPT-4o/o1/o3...).
2. **Combobox editable** — user có thể **chọn từ list** HOẶC **gõ tự do** một model id (ví dụ `free-tier-models`, `auto/best-free`, `antigravity/claude-sonnet-4-6`).

**Vấn đề gốc đang gặp:** Extension gửi model `auto` (không có trong 812 model gateway trả về) → OmniRoute rơi vào zero-config routing → vớ phải provider hỏng (Devin CLI Agentic, lỗi 500 `DEVIN_AGENTIC_HOME`) → không failover vì lỗi 500 không nằm trong danh sách lockout. Khi user chọn được đúng model/combo hợp lệ từ list động, lỗi này biến mất.

---

## 2. Bối cảnh kỹ thuật (đã khảo sát — tin cậy)

### 2.1. Phần ĐÃ CÓ SẴN (tái sử dụng, không viết lại)
- **`fetchGatewayModels(baseUrl, authHeader?)`** — `extension/src/chat-panel/chat-models.ts:120`. Đây là hàm fetch `/v1/models` chuẩn: tự build `{base}/v1/models` (hoặc `{base}/models` nếu base kết thúc bằng `/v1`), timeout 5s (AbortController), parse `{data:[{id, display_name/name, description, rate_multiplier}]}`, trả `null` nếu lỗi.
- **`ProviderConfigService.getModels(provider, currentModel)`** — `extension/src/services/ProviderConfigService.ts:68`. Đã gọi `fetchGatewayModels(fetchUrl)` (line 82), merge với static, append current model nếu chưa có (line ~90), chọn selected.
- **Message protocol `getModels`/`models`/`setModel`** — đã tồn tại đầy đủ (xem 2.3). **KHÔNG cần thêm message mới.**

### 2.2. File render dropdown (đây là chỗ sửa UI chính)
- **`extension/src/panels/settings/SettingsPanel.ts:127`** — HTML của Settings panel (hand-written HTML string, KHÔNG phải Svelte):
  ```html
  <div class="form-group">
    <label for="model-input">Model</label>
    <select id="model-input"><option value="">— Select model —</option></select>
  </div>
  ```
  - CSP dòng ~113: `connect-src 'none'` → webview KHÔNG tự fetch được; mọi fetch `/v1/models` phải chạy ở **host side** (đã đúng vậy). **Giữ nguyên CSP.**
- **`extension/webview-assets/settings/settings.js`** — JS thuần của webview:
  - `modelInput = getElementById("model-input")` (line 36)
  - `updateModelOptions(provider)` (line 212) — clear + repopulate `<select>` từ `modelsFor(provider)`
  - `modelInput.addEventListener("change", ...)` (line 309) → post `{ type: "setModel", model: modelInput.value }`
  - `handleModels(msg)` (line 627) — nhận `models` từ host, lưu `modelsByProvider`, re-render, apply `msg.selected`
  - Provider change (line 133) + init → post `{ type: "getModels", provider }`

### 2.3. Message protocol (Settings panel — untyped `any`)
Handler: `extension/src/panels/settings/SettingsMessageHandler.ts`
- Request list: `{ type: "getModels", provider }` → `handleGetModels` (line 122) → `ProviderConfigService.getModels()` → post `{ type: "models", provider, models, selected, defaultModel }`
- Gửi lựa chọn: `{ type: "setModel", model }` (line 47) → `configService.updateConfig("llmModel", msg.model)` → lưu vào config key `kiroSdlc.llmModel`
- Save API key: `handleSaveApiKey` (line 137) → `secrets.store(SECRET_KEYS[provider], key)`; OpenAI secret key = `kiroSdlc.openaiApiKey`

### 2.4. Nguồn API key & baseUrl
- **API key**: VS Code `SecretStorage`, key `kiroSdlc.openaiApiKey` (map trong `extension/src/models/`, `SECRET_KEYS`).
- **baseUrl**: config `kiroSdlc.openaiBaseUrl` (map trong `extension/src/models/LlmProviderConfig.ts`: `PROVIDER_BASE_URL_KEYS`, `PROVIDER_BASE_URL_DEFAULTS`).

### 2.5. ⚠️ GOTCHA quan trọng (nguyên nhân list không load)
`ProviderConfigService.getModels()` gọi `fetchGatewayModels(fetchUrl)` **KHÔNG truyền auth header**. OmniRoute `/v1/models` trả **401 nếu thiếu Bearer key** → hàm trả `null` → UI **âm thầm fallback về list cứng**. Đây chính là lý do dropdown chỉ thấy GPT-4o/o1/o3.
> **Đã kiểm chứng thực tế:** `GET /v1/models` không key → 401; có `Authorization: Bearer sk-...` → 200 với 812 model (gồm `free-tier-models`, `auto/best-free`, `auto/coding:free`).

---

## 3. Các thay đổi cần làm

### TASK 1 — Truyền API key vào fetch `/v1/models` (sửa lỗi 401 → fallback)
**File:** `extension/src/services/ProviderConfigService.ts` (hàm `getModels`, ~line 68–90)

- Lấy API key của provider từ SecretStorage trước khi gọi `fetchGatewayModels`.
- Truyền `authHeader = "Bearer " + apiKey` (chỉ khi có key) vào tham số thứ 2 của `fetchGatewayModels(fetchUrl, authHeader)`.
- Nếu không có key → gọi như cũ (không header) để giữ tương thích các provider không cần auth.

**Gợi ý:** `ProviderConfigService` cần truy cập `secrets` (ExtensionContext.secrets). Nếu service chưa có, inject qua constructor (xem cách `SettingsMessageHandler.handleSaveApiKey` dùng `secrets`). Dùng `SECRET_KEYS[provider]` để lấy đúng key name.

**Chấp nhận:** với OpenAI + baseUrl `http://localhost:20128/v1` + key đã lưu, `getModels("openai")` trả về > 100 model (không còn chỉ list cứng).

### TASK 2 — Đảm bảo openai có baseUrl mặc định trỏ gateway (nếu cần)
**File:** `extension/src/models/LlmProviderConfig.ts` (`PROVIDER_BASE_URL_DEFAULTS`)

- Xác nhận `openai` resolve ra baseUrl người dùng đã cấu hình (`kiroSdlc.openaiBaseUrl` = `http://localhost:20128/v1`). Nếu `getGatewayBaseUrl("openai")` trả rỗng khi user chưa set, `fetchGatewayModels` sẽ không chạy. Không hardcode localhost làm default toàn cục (vì OpenAI thật là api.openai.com) — chỉ đảm bảo khi user đã điền baseUrl thì nó được dùng. **Chỉ sửa nếu khảo sát thấy openai bị bỏ qua nhánh gateway fetch.**

### TASK 3 — Đổi `<select>` thành combobox editable (UI)
**File A:** `extension/src/panels/settings/SettingsPanel.ts:127`

Thay block `<select id="model-input">` bằng input + datalist:
> ⛔ **KHÔNG dùng `<datalist>`.** Popup của `<datalist>` là native OS, không CSS được → xấu, nền trắng, lệch dark theme VS Code (đã xác nhận qua screenshot). PHẢI làm **custom combobox**: `<input>` + một `<div>` dropdown tự render, style theo biến theme VS Code.

**Markup (SettingsPanel.ts:127):**
```html
<div class="form-group">
  <label for="model-input">Model</label>
  <div class="combobox" id="model-combobox">
    <input id="model-input" type="text" autocomplete="off" spellcheck="false"
           role="combobox" aria-autocomplete="list" aria-expanded="false"
           aria-controls="model-listbox"
           placeholder="Chọn hoặc gõ model id (vd: free-tier-models, auto/best-free)" />
    <button type="button" id="model-toggle" class="combobox-toggle" aria-label="Toggle model list" tabindex="-1">▾</button>
    <ul id="model-listbox" class="combobox-list" role="listbox" hidden></ul>
  </div>
  <div id="model-description-info" class="field-hint"></div>
</div>
```

**CSS (thêm vào `<style>` trong SettingsPanel.ts, hoặc file css settings đang dùng).** Dùng biến theme VS Code để khớp giao diện:
```css
.combobox { position: relative; display: flex; align-items: center; }
.combobox > input { flex: 1; padding-right: 26px; }
.combobox-toggle {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  background: transparent; border: none; cursor: pointer; padding: 2px 4px;
  color: var(--vscode-foreground); opacity: 0.7; font-size: 11px;
}
.combobox-toggle:hover { opacity: 1; }
.combobox-list {
  position: absolute; z-index: 50; top: calc(100% + 2px); left: 0; right: 0;
  margin: 0; padding: 4px 0; list-style: none;
  max-height: 260px; overflow-y: auto;
  background: var(--vscode-dropdown-background, var(--vscode-editorWidget-background));
  color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
  border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, rgba(128,128,128,0.35)));
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.36);
  font-size: 12px;
}
.combobox-list[hidden] { display: none; }
.combobox-option {
  display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
  padding: 5px 10px; cursor: pointer; white-space: nowrap;
}
.combobox-option .opt-id { overflow: hidden; text-overflow: ellipsis; }
.combobox-option .opt-meta { opacity: 0.6; font-size: 11px; flex-shrink: 0; }
.combobox-option:hover,
.combobox-option.active {
  background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground));
  color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
}
.combobox-empty { padding: 6px 10px; opacity: 0.6; font-style: italic; }
```
> KHÔNG hardcode màu — chỉ dùng `var(--vscode-*)` để tự khớp dark/light theme. Đây là điểm sửa "xấu" chính.

**File B:** `extension/webview-assets/settings/settings.js` — thay logic `<datalist>`/`<select>` bằng custom combobox:

1. **Render list**: viết `renderModelList(models, filterText)` đổ `<li class="combobox-option" data-id="...">` vào `#model-listbox`. Mỗi option: span `.opt-id` = model id, span `.opt-meta` = tên/`Free`/credits. Nếu list rỗng sau filter → 1 `<li class="combobox-empty">Không có model khớp</li>` (vẫn cho gõ tự do). `updateModelOptions(provider)` (line 212) gọi lại `renderModelList`.
2. **Mở/đóng dropdown**:
   - Focus vào input hoặc gõ → set `aria-expanded=true`, bỏ `hidden` của `#model-listbox`, render list đã filter theo `input.value`.
   - Click nút `#model-toggle` → toggle mở/đóng, hiện full list (không filter).
   - Click ra ngoài `#model-combobox` (document click listener) → đóng, set `hidden`.
   - `Escape` → đóng.
3. **Filter khi gõ**: listener `input` trên `#model-input` → `renderModelList(models, input.value)` (lọc client-side theo substring, không phân biệt hoa thường trên id + name). Vẫn giữ debounce `setModel` 400ms như hiện tại (line ~309) để lưu giá trị gõ tự do.
4. **Chọn option**: click một `.combobox-option` → set `input.value = dataset.id`, đóng dropdown, post `{ type: "setModel", model: id }`, cập nhật `#model-description-info`.
5. **Bàn phím** (tối thiểu, nên có cho gọn): `ArrowDown`/`ArrowUp` di chuyển class `.active` giữa options; `Enter` chọn option `.active` (nếu có) hoặc chấp nhận giá trị đang gõ rồi đóng. `scrollIntoView` option active.
6. **Free-form**: giá trị gõ luôn được chấp nhận kể cả không khớp option nào — `change`/debounce vẫn post `{ type: "setModel", model: input.value.trim() }`. KHÔNG ép phải chọn trong list.
7. Bỏ mọi tham chiếu `<datalist id="model-datalist">` cũ. `updateModelDescription` (line ~250) giữ nguyên, gọi sau khi set value.

**Ollama:** `<select id="ollama-model-input">` (line 128) — ngoài phạm vi, giữ nguyên `<select>` thường (Ollama list ngắn, không cần combobox), trừ khi cùng code path bị vỡ.

### TASK 4 — Free-form value đi xuyên suốt (kiểm tra, thường không cần sửa)
- `setModel` (SettingsMessageHandler:47) đã nhận string bất kỳ → lưu `kiroSdlc.llmModel`. ✓
- `getModels` đã append current model nếu không có trong list (ProviderConfigService ~line 90) → model gõ tay vẫn hiển thị lại. ✓
- Xác nhận không có validation nào chặn model id lạ ở host.

---

## 4. Build & Test

```bash
# trong thư mục extension/
npm run compile          # tsc type-check
npm run esbuild          # build host bundle (dev)
npm run copy-resources   # copy webview-assets (settings.js) — BẮT BUỘC vì settings.js là static
npm test                 # vitest run
npm run lint             # eslint src/
```

- Test liên quan: `src/chat-panel/__tests__/chat-models.test.ts`, `src/pi-workflow/__tests__/pi-gateway-model.test.ts`.
- **Bổ sung test cho TASK 1:** thêm case verify `getModels` truyền `Authorization: Bearer <key>` khi secret tồn tại (mock `fetchGatewayModels`, assert tham số thứ 2). Đặt trong test hiện có của ProviderConfigService (nếu chưa có file test, tạo `src/services/__tests__/ProviderConfigService.test.ts`).

---

## 5. Verify thủ công (end-to-end)

1. Reload extension (F5 hoặc reload window sau build).
2. Mở **SDLC Pipeline Settings → LLM Provider**.
3. Provider = OpenAI, Base URL = `http://localhost:20128/v1`, đã Save API Key.
4. Ô **Model**: bấm vào → **dropdown custom hiện > 100 model động** từ gateway (gồm `free-tier-models`, `auto/best-free`, `antigravity/claude-sonnet-4-6`...).
5. **Kiểm tra giao diện dropdown**: nền + chữ + viền + hover khớp dark theme VS Code (KHÔNG còn popup native nền trắng của `<datalist>`). Cuộn được khi list dài, hover đổi màu, filter khi gõ.
6. **Gõ tự do** `free-tier-models` → giá trị được nhận, lưu vào `kiroSdlc.llmModel`.
7. Bấm **Test LLM** → phải thành công (không còn lỗi 500 `DEVIN_AGENTIC_HOME`), vì request đi qua combo/model hợp lệ.
8. Reload lại panel → giá trị `free-tier-models` vẫn được giữ và hiển thị.
9. Đổi theme VS Code (dark ↔ light) → dropdown vẫn khớp màu (nhờ dùng `var(--vscode-*)`).

**Chấp nhận cuối:** dropdown động + giao diện khớp theme (không native) + gõ tự do được + Test LLM xanh với `free-tier-models`.

---

## 6. Lưu ý / Rủi ro

- **CSP**: giữ `connect-src 'none'`; KHÔNG cho webview tự fetch. Fetch model list phải chạy host-side (đã đúng). Nếu vô tình để webview fetch sẽ bị CSP chặn.
- **`out/` là build artifact** — sửa `src/` + `webview-assets/` rồi build, đừng sửa `out/` trực tiếp (sẽ bị ghi đè và không phải nguồn thật).
- **Bảo mật**: đừng log API key ra console khi build header. Đọc key từ SecretStorage, không hardcode.
- **Timeout `fetchGatewayModels` = 5s**: một số gateway trả model list nhanh; nếu gateway chậm, list rỗng → fallback static. Có thể cân nhắc nâng timeout lên 8–10s cho `/v1/models` (không bắt buộc).
- **Provider free chập chờn**: đây là vấn đề riêng của combo (đã cấu hình `free-tier-models` gồm Antigravity Gemini 3.7, Antigravity Claude Sonnet 4.6, Agnes 2.0, NVIDIA nemotron — các model đã test OK). Không thuộc phạm vi task UI này.

---

## 7. Tóm tắt file đụng tới

| File | Thay đổi |
|------|----------|
| `extension/src/services/ProviderConfigService.ts` | TASK 1 — truyền Bearer key vào `fetchGatewayModels` |
| `extension/src/models/LlmProviderConfig.ts` | TASK 2 — (chỉ nếu cần) đảm bảo openai dùng baseUrl user set |
| `extension/src/panels/settings/SettingsPanel.ts` | TASK 3A — `<select>` → custom combobox (`<input>` + `<ul>` dropdown) + CSS theo `var(--vscode-*)` |
| `extension/webview-assets/settings/settings.js` | TASK 3B — render list custom, mở/đóng/filter/chọn/keyboard, free-form |
| `extension/src/services/__tests__/ProviderConfigService.test.ts` | TASK 4 — test truyền auth header |

Không sửa: `message-protocol.ts` (protocol đã đủ), `out/**` (build output), Chat Panel Svelte (khác panel).
