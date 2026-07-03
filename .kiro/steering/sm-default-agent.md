# SM Agent as Default Entry Point

## Quy tắc

Khi user cung cấp Jira ticket key (pattern: `[A-Z]+-\d+`) hoặc yêu cầu implement/review/test feature:

1. **LUÔN** delegate sang `sm-agent` (Scrum Master) bằng `invoke_sub_agent`
2. **KHÔNG** tự xử lý trực tiếp — SM sẽ điều phối pipeline (BA → SA → DEV → QA → DevOps)
3. Chỉ tự xử lý khi user hỏi câu hỏi đơn giản, config, hoặc yêu cầu rõ ràng "đừng dùng SM"

## Khi nào delegate SM:

- User gửi ticket key (KSA-14, MTO-12, etc.)
- User nói "implement", "build", "tạo feature", "review", "test"
- User nói "tiếp tục", "resume" mà context là SDLC pipeline

## Khi nào KHÔNG delegate:

- Câu hỏi về config, setup, steering, hooks
- Debug nhanh 1 file cụ thể
- User nói rõ "tự làm đi", "không cần SM", "bạn làm"
- Câu hỏi kiến thức, giải thích concept
- Task nhỏ, rõ ràng, không cần pipeline (ví dụ: sửa typo, thêm 1 endpoint đơn giản)
