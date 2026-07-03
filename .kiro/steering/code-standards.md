# Code Standards (All Languages)

## ⛔ Nguyên tắc cốt lõi

1. **SOLID Coder** — Mọi code PHẢI tuân thủ SOLID principles (xem chi tiết bên dưới)
2. **OOP Design Patterns bắt buộc** — PHẢI sử dụng Design Patterns phù hợp, KHÔNG viết code procedural/spaghetti

## ⛔ Giới hạn kích thước bắt buộc

### File: tối đa 200 dòng
- Mỗi file source code KHÔNG ĐƯỢC vượt quá 200 dòng (bao gồm comments, blank lines)
- Nếu file vượt 200 dòng → tách thành nhiều file theo trách nhiệm (SRP)
- Ví dụ: `IntegrationsPage.ts` (>200 dòng) → tách thành `IntegrationsPage.ts` (render + events) + `IntegrationsConfigModal.ts` (modal logic) + `IntegrationsTestLink.ts` (test connection logic)

### Hàm: tối đa 20 dòng
- Mỗi function/method KHÔNG ĐƯỢC vượt quá 20 dòng (không tính signature và closing brace)
- Nếu hàm vượt 20 dòng → tách thành nhiều hàm nhỏ hơn với tên mô tả rõ ràng
- Ví dụ: `renderProviderCards()` (>20 dòng) → tách thành `renderProviderCards()` + `createProviderCard(provider)` + `bindCardEvents(card, provider)`

## ⛔ Tách biệt Model và Processing

### Model classes (data classes, DTOs, enums, interfaces) phải ở module/folder riêng

```
# ❌ CẤM — Model và logic chung file
// IntegrationsPage.ts
interface ProviderInfo { ... }  // ← CẤM
interface TestResult { ... }    // ← CẤM
export function render() { ... }

# ✅ ĐÚNG — Model ở folder riêng
// models/ProviderInfo.ts
export interface ProviderInfo { ... }

// models/TestResult.ts
export interface TestResult { ... }

// pages/IntegrationsPage.ts
import { ProviderInfo, TestResult } from '../models'
export function render() { ... }
```

### Quy tắc cấu trúc folder
- `models/` — Data classes, DTOs, enums, interfaces, types
- `pages/` hoặc `views/` — Page controllers (UI logic, event binding, DOM manipulation)
- `components/` — Reusable UI components
- `api/` hoặc `clients/` — HTTP client, API calls
- `router/` — Navigation logic
- `services/` — Business logic helpers (validation, formatting, state management)
- `utils/` — Pure utility functions (không có side effects)

## ⛔ OOP Design Patterns bắt buộc

### Sử dụng design patterns phù hợp

| Pattern | Khi nào dùng | Ví dụ |
|---------|-------------|-------|
| Strategy | Nhiều cách xử lý cùng loại dữ liệu | `ProviderConfigStrategy` cho các config khác nhau |
| Observer | Thông báo thay đổi state | `ScanStatusObserver` cho polling updates |
| Factory | Tạo objects phức tạp | `ProviderCardFactory.create(provider)` |
| Template Method | Quy trình chung với bước tùy biến | `BasePage.render()` → `onBind()` → `onLoad()` |
| Facade | Đơn giản hóa subsystem phức tạp | `ApiClient` facade cho HTTP calls |

### Ví dụ Template Method cho Pages

```typescript
// BasePage.ts
abstract class BasePage {
    constructor(private templateName: string) {}

    async render(container: HTMLElement): Promise<void> {
        container.innerHTML = '';
        this.cleanup();
        const html = await ApiClient.loadTemplate(this.templateName);
        container.innerHTML = html;
        this.onBind();
        await this.onLoad();
    }

    protected cleanup(): void {}
    protected abstract onBind(): void;
    protected abstract onLoad(): Promise<void>;
}

// AnalysisPage.ts
class AnalysisPage extends BasePage {
    constructor() { super('analysis'); }
    protected onBind(): void { this.bindDiveReportsButton(); }
    protected async onLoad(): Promise<void> { await this.loadAnalysisData(); }
    protected cleanup(): void { this.cancelPollingJobs(); }
}
```

## ⛔ SOLID Principles bắt buộc

### S — Single Responsibility Principle
- Mỗi class/module chỉ có MỘT lý do để thay đổi
- Page controller chỉ lo render + events, KHÔNG chứa business logic phức tạp
- Business logic (validation, formatting, calculations) tách vào `services/`

```
# ❌ CẤM — Page chứa validation logic
class SettingsPage {
    private isValidUrl(url: string): boolean { ... }       // ← Business logic
    private maskSensitiveField(value: string): string { ... } // ← Business logic
}

# ✅ ĐÚNG — Tách validation vào service
// services/ValidationService.ts
export function isValidUrl(url: string): boolean { ... }

// services/MaskingService.ts
export function maskSensitiveField(value: string): string { ... }
```

### O — Open/Closed Principle
- Classes mở cho extension, đóng cho modification
- Dùng interfaces và abstract classes thay vì sửa code hiện có
- Thêm provider mới → implement interface, KHÔNG sửa switch/if-else block

### L — Liskov Substitution Principle
- Subclass phải thay thế được parent class mà không thay đổi behavior
- Tất cả Pages implement cùng interface/abstract class

### I — Interface Segregation Principle
- Interfaces nhỏ, tập trung vào một nhóm chức năng
- KHÔNG tạo "god interface" với quá nhiều methods

```
# ❌ CẤM
interface PageController {
    render(): void; cleanup(): void; loadData(): Promise<void>;
    bindEvents(): void; handleError(e: Error): void; showToast(msg: string): void;
    startPolling(): void; stopPolling(): void;
}

# ✅ ĐÚNG
interface Renderable { render(container: HTMLElement): void; }
interface Cleanable { cleanup(): void; }
interface Pollable { startPolling(): void; stopPolling(): void; }
```

### D — Dependency Inversion Principle
- Depend on abstractions, not concretions
- Page controllers depend on interfaces, not implementations
- Dễ dàng mock cho testing

## ⛔ Serialization / JSON Handling

### Quy tắc chung

1. **Protocol communication** (JSON-RPC, MCP, WebSocket): PHẢI serialize tất cả fields — protocol specs yêu cầu tất cả fields phải có mặt
2. **API responses** (REST endpoints): NÊN include default values — frontend cần biết giá trị mặc định
3. **Internal serialization** (DB, cache): Có thể bỏ optional fields nếu muốn tiết kiệm dung lượng
4. **Shared serializer instance**: Ưu tiên dùng 1 shared instance per module thay vì tạo mới mỗi lần

### Language-specific notes

- **Kotlin** (`kotlinx.serialization`): Dùng `encodeDefaults = true` cho protocol/API communication
- **TypeScript/JavaScript**: Dùng explicit serialization functions, tránh `JSON.stringify` trực tiếp cho protocol messages
- **Python** (`pydantic`, `dataclasses`): Dùng `model_dump(exclude_none=False)` cho protocol communication
- **Java** (`Jackson`): Dùng `@JsonInclude(Include.ALWAYS)` cho protocol/API DTOs

### Checklist khi xử lý serialization

- [ ] Default values được include khi serialize cho protocol/API?
- [ ] Unknown keys được bỏ qua khi deserialize từ external source?
- [ ] Không tạo serializer instance inline trong function?
- [ ] Dùng strong typing thay vì `any`/`Object`/`dynamic`?

## ⛔ Exception Handling bắt buộc

### Quy tắc

1. **KHÔNG ĐƯỢC nuốt exception** — Mọi `catch` block PHẢI có hành động xử lý rõ ràng (log, rethrow, hoặc thông báo user)
2. **LUÔN thể hiện exception cho user biết** — User phải được thông báo khi có lỗi xảy ra (toast, alert, error message trên UI, hoặc error response)

### Ví dụ

```
# ❌ CẤM — Nuốt exception
try {
    await fetchData();
} catch (e) {
    // im lặng, không làm gì
}

# ❌ CẤM — Chỉ log mà không thông báo user
try {
    await fetchData();
} catch (e) {
    console.log(e);  // User không biết có lỗi
}

# ✅ ĐÚNG — Thông báo user + log
try {
    await fetchData();
} catch (e) {
    logger.error("Failed to fetch data", e);
    showErrorToast("Không thể tải dữ liệu. Vui lòng thử lại.");
}

# ✅ ĐÚNG — Rethrow để caller xử lý
try {
    await fetchData();
} catch (e) {
    throw new AppError("DATA_FETCH_FAILED", "Không thể tải dữ liệu", e);
}
```

### Ngoại lệ duy nhất cho phép

- Cleanup code trong `finally` block có thể bỏ qua lỗi phụ (nhưng PHẢI log)
- Retry logic có thể bắt exception ở vòng lặp nhưng PHẢI thông báo user nếu retry hết lần

## Checklist khi viết/review code

- [ ] File ≤ 200 dòng?
- [ ] Mỗi hàm ≤ 20 dòng?
- [ ] Model classes/interfaces ở folder riêng?
- [ ] Không có business logic trong page controllers?
- [ ] Sử dụng design pattern phù hợp?
- [ ] Tuân thủ SOLID?
- [ ] Interfaces/abstractions cho dependencies?
- [ ] Naming rõ ràng, tự mô tả (không cần comment giải thích tên)?
- [ ] Error handling đúng cách (không swallow errors)?
- [ ] Mọi exception đều được thông báo cho user?
