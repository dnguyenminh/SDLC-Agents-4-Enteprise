# Functional Specification Document (FSD)

## JiraAssist Extension — SA4E-229: Implement jira_download_attachment tool to fix 403 error when fetching attachments

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-229 |
| Title | Implement jira_download_attachment tool to fix 403 error when fetching attachments |
| Author | BA + TA Agent |
| Version | 1.0 |
| Date | 2026-08-28 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-229 |
| Related TDD | TDD-v1.0-SA4E-229 |

## 1. Overview
Implement `jira_download_attachment` as an **in-process local MCP tool inside the JiraAssist extension** (VS Code/Kiro). It uses the extension's authenticated session (`AtlassianHttpClient` → `AtlassianCredentialService` from SecretStorage) to fetch attachment content, eliminating the 403 Forbidden errors that occur when `webfetch` is used with the raw attachment URL (which lacks auth headers).

## 2. Functional Requirements
### FR-01: Download by Attachment ID
- Input: `attachment_id`
- Process: GET `/rest/api/2/attachment/{id}` → resolve `content` URL → authenticated download via `requestRaw`
- Output: `content_base64`, `mime_type`, `size_bytes`, `filename`

### FR-02: Download by URL
- Input: `attachment_url`
- Process: authenticated download via `requestRaw` on the URL path
- Output: same as FR-01

### FR-03: Return Format
- `return_format`: `base64` (default) or `text`

### FR-04: Error Handling
- Missing both params → `VALIDATION_ERROR`
- Attachment not found / 404 → `NOT_FOUND`
- 403 → `FORBIDDEN` (credentials issue)
- Content download fails → `NOT_FOUND`

## 3. API Contract
Tool: `jira_download_attachment`
Parameters:
- `attachment_id`: string (optional)
- `attachment_url`: string (optional)
- `return_format`: enum ["base64","text"] default "base64"
Returns:
- `content_base64`: string (when base64)
- `content_text`: string (when text)
- `mime_type`: string
- `filename`: string
- `size_bytes`: integer

## 4. Sequence
User/Agent → extension local tool `jira_download_attachment` → `AtlassianHttpClient.request` (resolve ID) → `AtlassianHttpClient.requestRaw` (download) → return content.
See diagrams/api-sequence-download.drawio

## 5. Data Model
AttachmentMetadata { id, content URL, filename, mimeType, size }

## 6. Non-Functional
- Performance <5s for <10MB
- Security: reuse extension authenticated session, no credential leakage, never log content

## 7. Integration Points
- `jira_get_attachments` (provides attachment IDs/URLs)
- `AtlassianCredentialService` (auth)
- `AtlassianHttpClient.requestRaw` (binary download)

## 8. Out of Scope
- Backend MCP server (`backend/src/servers/atlassian`) does NOT expose this tool.
- Upload/new attachment capabilities.

## Appendix
Diagrams: system-context.drawio, api-sequence-download.drawio
