---
inclusion: fileMatch
fileMatchPattern: "**/*.kt"
---

# Kotlin Code Standards

## ⛔ Giới hạn kích thước bắt buộc

### File: tối đa 200 dòng
- Mỗi file `.kt` KHÔNG ĐƯỢC vượt quá 200 dòng (bao gồm comments, blank lines)
- Nếu file vượt 200 dòng → tách thành nhiều file theo trách nhiệm (SRP)
- Ví dụ: `IntegrationsPage.kt` (>200 dòng) → tách thành `IntegrationsPage.kt` (render + events) + `IntegrationsConfigModal.kt` (modal logic) + `IntegrationsTestLink.kt` (test connection logic)

### Hàm: tối đa 20 dòng
- Mỗi function/method KHÔNG ĐƯỢC vượt quá 20 dòng (không tính signature và closing brace)
- Nếu hàm vượt 20 dòng → tách thành nhiều hàm nhỏ hơn với tên mô tả rõ ràng
- Ví dụ: `renderProviderCards()` (>20 dòng) → tách thành `renderProviderCards()` + `createProviderCard(provider)` + `bindCardEvents(card, provider)`

## ⛔ Tách biệt Model và Processing

### Model classes (data classes, DTOs, enums) phải ở package riêng
```
# ❌ CẤM — Model và logic chung file
// IntegrationsPage.kt
object IntegrationsPage {
    @Serializable data class ProviderInfo(...)  // ← CẤM
    @Serializable data class TestResult(...)    // ← CẤM
    fun render() { ... }
}

# ✅ ĐÚNG — Model ở package riêng
// models/ProviderInfo.kt
package com.assistant.frontend.models
@Serializable data class ProviderInfo(...)

// models/TestResult.kt
package com.assistant.frontend.models
@Serializable data class TestResult(...)

// pages/IntegrationsPage.kt
package com.assistant.frontend.pages
import com.assistant.frontend.models.*
object IntegrationsPage { ... }
```

### Quy tắc package
- `models/` — Data classes, DTOs, enums, sealed classes
- `pages/` — Page controllers (UI logic, event binding, DOM manipulation)
- `components/` — Reusable UI components (Shell, Sidebar, Navbar)
- `api/` — HTTP client, API calls
- `router/` — Navigation logic
- `charts/` — SVG chart renderers
- `services/` — Business logic helpers (validation, formatting, state management)

## ⛔ OOP Design Patterns bắt buộc

### Sử dụng design patterns phù hợp

| Pattern | Khi nào dùng | Ví dụ |
|---------|-------------|-------|
| Strategy | Nhiều cách xử lý cùng loại dữ liệu | `ProviderConfigStrategy` cho Ollama/Gemini/LMStudio config |
| Observer | Thông báo thay đổi state | `ScanStatusObserver` cho polling updates |
| Factory | Tạo objects phức tạp | `ProviderCardFactory.create(provider)` |
| Template Method | Quy trình chung với bước tùy biến | `BasePage.render()` → `onBind()` → `onLoad()` |
| Facade | Đơn giản hóa subsystem phức tạp | `ApiClient` facade cho HTTP calls |

### Ví dụ Template Method cho Pages
```kotlin
// BasePage.kt
abstract class BasePage(private val templateName: String) {
    protected val scope = MainScope()
    protected val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun render(container: Element) {
        container.innerHTML = ""
        cleanup()
        scope.launch {
            val html = ApiClient.loadTemplate(templateName)
            container.innerHTML = html
            onBind()
            onLoad()
        }
    }

    open fun cleanup() {}
    protected abstract fun onBind()
    protected abstract fun onLoad()
}

// AnalysisPage.kt
object AnalysisPage : BasePage("analysis") {
    override fun onBind() { bindDiveReportsButton() }
    override fun onLoad() { loadAnalysisData(); loadScanStatus() }
    override fun cleanup() { cancelPollingJobs() }
}
```

## ⛔ SOLID Principles bắt buộc

### S — Single Responsibility Principle
- Mỗi class/object chỉ có MỘT lý do để thay đổi
- Page controller chỉ lo render + events, KHÔNG chứa business logic phức tạp
- Business logic (validation, formatting, calculations) tách vào `services/`

```kotlin
# ❌ CẤM — Page chứa validation logic
object SettingsPage {
    private fun isValidUrl(url: String): Boolean { ... }  // ← Business logic
    private fun maskSensitiveField(value: String): String { ... }  // ← Business logic
}

# ✅ ĐÚNG — Tách validation vào service
// services/ValidationService.kt
object ValidationService {
    fun isValidUrl(url: String): Boolean { ... }
}

// services/MaskingService.kt
object MaskingService {
    fun maskSensitiveField(value: String): String { ... }
}
```

### O — Open/Closed Principle
- Classes mở cho extension, đóng cho modification
- Dùng interfaces và abstract classes thay vì sửa code hiện có
- Thêm provider mới → implement interface, KHÔNG sửa switch/when block

### L — Liskov Substitution Principle
- Subclass phải thay thế được parent class mà không thay đổi behavior
- Tất cả Pages implement cùng interface/abstract class

### I — Interface Segregation Principle
- Interfaces nhỏ, tập trung vào một nhóm chức năng
- KHÔNG tạo "god interface" với quá nhiều methods

```kotlin
# ❌ CẤM
interface PageController {
    fun render(); fun cleanup(); fun loadData()
    fun bindEvents(); fun handleError(); fun showToast()
    fun startPolling(); fun stopPolling()
}

# ✅ ĐÚNG
interface Renderable { fun render(container: Element) }
interface Cleanable { fun cleanup() }
interface Pollable { fun startPolling(); fun stopPolling() }
```

### D — Dependency Inversion Principle
- Depend on abstractions, not concretions
- Page controllers depend on interfaces (ApiClient interface), not implementations
- Dễ dàng mock cho testing

## Checklist khi viết/review Kotlin code

- [ ] File ≤ 200 dòng?
- [ ] Mỗi hàm ≤ 20 dòng?
- [ ] Model classes ở package `models/` riêng?
- [ ] Không có business logic trong page controllers?
- [ ] Sử dụng design pattern phù hợp?
- [ ] Tuân thủ SOLID?
- [ ] Interfaces cho dependencies?


## ⛔ Serialization — kotlinx.serialization

### LUÔN dùng `encodeDefaults = true` khi serialize cho protocol/API communication

```kotlin
// ❌ CẤM — Default values bị bỏ qua khi serialize
private val json = Json { ignoreUnknownKeys = true }
// Kết quả: {"id":1,"method":"initialize"} — THIẾU "jsonrpc":"2.0"

// ✅ ĐÚNG — Default values luôn được include
private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
// Kết quả: {"jsonrpc":"2.0","id":1,"method":"initialize"} — ĐẦY ĐỦ
```

### Quy tắc cụ thể

1. **Protocol communication** (JSON-RPC, MCP, WebSocket): PHẢI dùng `encodeDefaults = true` — protocol specs yêu cầu tất cả fields phải có mặt
2. **API responses** (REST endpoints): NÊN dùng `encodeDefaults = true` — frontend cần biết giá trị mặc định
3. **Internal serialization** (DB, cache): Có thể bỏ `encodeDefaults` nếu muốn tiết kiệm dung lượng
4. **Data classes với default values**: Nếu field có default value và PHẢI xuất hiện trong output → dùng `encodeDefaults = true`
5. **Shared Json instance**: Ưu tiên dùng 1 shared `Json` instance per module thay vì tạo mới mỗi lần

### Checklist khi tạo Json serializer

- [ ] `encodeDefaults = true` nếu serialize cho protocol/API?
- [ ] `ignoreUnknownKeys = true` nếu deserialize từ external source?
- [ ] `isLenient = true` chỉ khi cần parse JSON không chuẩn?
- [ ] Không tạo `Json { }` inline trong function — dùng companion object hoặc top-level val?
