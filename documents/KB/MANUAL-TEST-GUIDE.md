# Hướng dẫn Manual Test chuẩn SDLC

## Mục tiêu
Đảm bảo các tính năng được kiểm thử thủ công theo quy trình SDLC phase 6, với evidence file:line, không hallucination.

## Phạm vi áp dụng
- Unit test tự động
- Integration test
- System test thủ công cho UI/Chatbox/Extension
- Post-deployment verification

## Quy trình 6 bước

### 1. Chuẩn bị
- Xác định ticket, STC liên quan
- Đọc BRD/FSD/TDD để hiểu yêu cầu
- Chuẩn bị môi trường test: extension version, workspace, profile

### 2. Thiết kế test case
- Mỗi test case phải có: ID, Precondition, Steps, Expected Result, Actual Result, Evidence
- Evidence bắt buộc: file:line hoặc screenshot log

### 3. Thực hiện
- Thực hiện theo steps, ghi lại log
- Capture screenshot nếu UI
- Ghi lại timestamp

### 4. Verify guardrails
- KB-first: mem_search trước khi hành động
- Citation: mọi claim phải kèm file:line
- Evidence-first: edit diff + git diff + test log

### 5. Ghi nhận kết quả
- PASS / FAIL / BLOCKED
- Nếu FAIL: ghi root cause, không workaround

### 6. Ingest kinh nghiệm
- Sau khi hoàn thành, mem_ingest vào KB với tags: manual-test, sdcl, provenance

## Mẫu báo cáo

| Test ID | Scenario | Steps | Expected | Actual | Evidence | Result |
|---------|----------|-------|----------|--------|----------|--------|

## Checklist chất lượng
- [ ] Mọi claim có citation file:line
- [ ] Test log được lưu
- [ ] RUN-LOG.md cập nhật
- [ ] STATUS.json phase testing = done
- [ ] KB ingest hoàn tất

## Lưu ý chống hallucination
- Không tự bịa kết quả, phải có output thực tế
- Không skip mem_search
- Không dùng workaround, fix root cause
