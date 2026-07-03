---
inclusion: fileMatch
fileMatchPattern: "**/*.kt"
---

# No Workaround Rule — Fix Root Cause, Not Symptoms

## ⛔ Quy tắc tuyệt đối

Khi phát hiện vấn đề thiết kế (architecture mismatch, data inconsistency, module conflict):

1. **KHÔNG BAO GIỜ** dùng workaround/fallback/hack để bypass vấn đề
2. **PHẢI** phân tích root cause trước khi viết code fix
3. **PHẢI** kéo SA + TA + DEV vào thảo luận nếu vấn đề liên quan đến:
   - 2 modules dùng khác data source cho cùng entity
   - Interface contract không nhất quán giữa modules
   - Authentication/Authorization logic phân tán
   - Duplicate logic ở nhiều nơi

## Quy trình khi phát hiện design flaw

### Bước 1: SM nhận diện vấn đề
- Mô tả rõ: "Module A gọi X, Module B gọi Y, cùng entity nhưng khác kết quả"
- Xác định impact: Bao nhiêu chỗ bị ảnh hưởng?

### Bước 2: SA phân tích architecture
- Tại sao 2 modules dùng khác data source?
- Design intent ban đầu là gì?
- Giải pháp đúng (single source of truth) là gì?

### Bước 3: TA đề xuất technical fix
- Cụ thể: file nào cần sửa, interface nào cần thống nhất
- Migration plan nếu cần thay đổi schema/data

### Bước 4: DEV implement fix đúng
- Fix root cause, không phải symptom
- Verify bằng test: cùng input → cùng output ở cả 2 modules

## ⛔ Ví dụ CẤM

```kotlin
// ❌ WORKAROUND — bypass khi UserService không tìm thấy user
val user = userService.getUserByEmail(email)
if (user == null) {
    // Fallback: trust JWT role directly
    val roles = extractRolesFromJwt(headers)
    if (roles.any { it == "admin" }) return email  // ← BUG TIỀM ẨN
}

// ❌ WORKAROUND — query 2 tables vì không biết data ở đâu
val result = tableA.find(id) ?: tableB.find(id)  // ← DESIGN FLAW
```

## ✅ Ví dụ ĐÚNG

```kotlin
// ✅ FIX ROOT CAUSE — thống nhất 1 UserRepository cho cả auth và user management
// Cả AuthLoginHandler và AdminAuthMiddleware dùng CÙNG repository
class AdminAuthMiddleware(
    private val userRepository: UserRepository  // ← CÙNG instance với auth module
) {
    suspend fun validateAdmin(headers: Map<String, String>): String {
        val email = extractEmail(headers)
        val user = userRepository.findByEmail(email)  // ← Single source of truth
            ?: throw PermissionDeniedException("User not found")
        // ...
    }
}
```

## Checklist trước khi fix

- [ ] Root cause đã xác định rõ ràng?
- [ ] Fix có tạo single source of truth không?
- [ ] Fix có break module nào khác không?
- [ ] Có cần migration data không?
- [ ] Test verify cùng input → cùng output ở tất cả entry points?
