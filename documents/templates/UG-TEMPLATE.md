# User Guide (UG)

## {SYSTEM_NAME} — {TICKET_KEY}: {TICKET_SUMMARY}

> ⛔ **WRITING STANDARD (MUST READ BEFORE FILLING):** `.opencode/rules/sdlc/ug-writing-standard.md`
> Reference exemplar: `documents/SA4E-393/UG.md`
>
> This template produces a guide for **END USERS** — people who USE the product.
>
> **The One-Line Test:** "Could a non-engineer user of the product follow this document and succeed?" If any section answers NO — delete or rewrite it.
>
> **FORBIDDEN here:** draw.io architecture/sequence/state diagrams, Configuration Reference tables, API/tool schemas, class/file internals → they belong to BRD/FSD/TDD. Link to them in Section "Related documents" instead.
>
> **REQUIRED:** real screenshots from the RUNNING build (via `orca computer` automation) embedded inline at the step they illustrate; every step has a User Actions table; every screenshot has a Key Elements table; all example data is real (actual runIds/numbers), never fabricated.

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | {TICKET_KEY} |
| Title | {TICKET_SUMMARY} |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | {CURRENT_DATE} |
| Status | Draft |

---

## 1. {Feature} là gì?

{2–4 sentences: what this feature does for the user. Zero internals — no class names, no config keys, no API routes.}

{IF the product has a UI: embed the "entry point" screenshot here and add a Key Elements table.}

![{entry-point mô tả}](diagrams/screenshot-{entry-point}.png)

| Thành phần | Vị trí trên ảnh | Ý nghĩa |
|-----------|-----------------|---------|
| {element} | {where in the image} | {what it is for} |

---

## 2. Cài đặt & kiểm tra phiên bản

{ONLY if installation matters to the end user. Otherwise delete this section.}

**Bước 1 — {install action}:**

```bash
{single copy-paste command}
```

**Bước 2 — {verify action}:** {what the user sees when it worked}

---

## 3. {Main flow} — từng bước

### Bước 1: {Action name}

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | {exact action: keys, clicks, command} | {what appears/changes} |
| 2 | {next action} | {what appears/changes} |

![{bước 1 mô tả}](diagrams/screenshot-{step-1}.png)

| Thành phần | Vị trí trên ảnh | Ý nghĩa |
|-----------|-----------------|---------|
| {element} | {where} | {meaning} |

{⚠️ one-line caveat if a common mistake exists at this step.}

### Bước 2: {Action name}

{same pattern: User Actions table + screenshot + Key Elements table}

---

## 4. {Secondary flow} — {edge case / self-check / advanced usage}

{same pattern as Section 3. Delete if the feature has no secondary flow.}

---

## 5. Xử lý sự cố

| Hiện tượng | Nguyên nhân | Cách xử lý |
|-----------|-------------|-----------|
| {symptom the user SEES} | {likely cause, in user terms} | {concrete fix steps} |
| {symptom} | {cause} | {fix} |

> Rules: order by how often users hit it; describe by SYMPTOM (what they see), not by error code; keep fixes to 1–3 steps each.

---

## 6. Câu hỏi thường gặp (FAQ)

**Hỏi: {question in the user's own words}?**  
Đáp: {answer in 1–3 sentences, no jargon}.

**Hỏi: {question}?**  
Đáp: {answer}.

{4–6 questions total.}

---

## 7. Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| `documents/{TICKET-KEY}/BRD.md` | Yêu cầu nghiệp vụ |
| `documents/{TICKET-KEY}/FSD.md` | Đặc tả chức năng |
| `documents/{TICKET-KEY}/TDD.md` | Thiết kế kỹ thuật + kiến trúc (diagrams) |
| `documents/{TICKET-KEY}/RUN-LOG.md` | Lịch sử chạy + evidence |

---

## Self-Check Before Reporting Done (DEV agent)

1. Every embedded image path exists on disk (`Test-Path`) — broken links are a defect.
2. Zero draw.io architecture images in the document.
3. Every step has an expected result; every screenshot has a Key Elements table.
4. All example data traceable to a real run.
5. Read your own doc as a first-time user: could you complete the main flow using ONLY this document?
