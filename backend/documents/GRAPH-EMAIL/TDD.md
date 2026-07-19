# Technical Design Document (TDD)

## Microsoft Graph API Email Integration — GRAPH-EMAIL

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | GRAPH-EMAIL |
| Title | Microsoft Graph API Email Integration for Salesforce |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-01-27 |
| Status | Draft |
| Related BRD | BRD-v1-GRAPH-EMAIL.docx |
| Related FSD | FSD-v1-GRAPH-EMAIL.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-27 | SA Agent | Initiate document |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies HOW to implement the Microsoft Graph API Email Integration. It covers architecture, class design, API contracts, and deployment concerns.

### 1.2 Scope

All Apex classes, custom objects, custom metadata types, and platform configurations required for the Graph API email integration.

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | Apex | v60.0+ |
| Platform | Salesforce | Lightning |
| External API | Microsoft Graph | v1.0 |
| Auth | OAuth2 (client_credentials) | v2.0 |
| Cache | Salesforce Platform Cache | Org Cache |
| Async | Salesforce Queueable | - |
| Scheduler | Salesforce Schedulable | - |
| Testing | Apex Test Framework | - |

### 1.4 Design Principles

- **Strategy Pattern**: IEmailSender interface with pluggable implementations
- **Factory Pattern**: EmailSenderFactory for sender instantiation and registration
- **Facade Pattern**: EmailSenderUtil as single entry point for consumers
- **Gateway Pattern**: MsGraphEmailGateway isolates all HTTP transport (no DML, no SOQL)
- **Separation of Concerns**: Business logic (EmailSenderGraphApi) separate from transport (MsGraphEmailGateway)
- **Governor Limit Compliance**: All callouts before DML, bulk operations, no DML in loops

### 1.5 Constraints

- Salesforce governor limit: 100 callouts per transaction
- Salesforce governor limit: 6MB sync heap / 12MB async heap
- Graph API batch limit: 20 requests per  call
- Graph API sendMail payload: ~4MB max (forces upload session for larger)
- Platform Cache: requires pre-created partition (MsGraphGateway)
- Queueable depth limit: 1 child job per parent (chain pattern)

---

## 2. System Architecture

### 2.1 Architecture Overview

![Architecture Diagram](diagrams/architecture.png)

The system uses a layered architecture within Salesforce:

1. **Consumer Layer** — Business Apex code, Batch jobs, Triggers
2. **Facade Layer** — EmailSenderUtil (static methods, convenience builders)
3. **Factory Layer** — EmailSenderFactory (registry + type resolution)
4. **Strategy Layer** — IEmailSender implementations (Salesforce, GraphAPI)
5. **Preparation Layer** — EmailSenderGraphApi (template rendering, merge fields, payload building)
6. **Transport Layer** — MsGraphEmailGateway (HTTP only, no DML/SOQL)
7. **Async Layer** — MsGraphLargeAttachmentSender (Queueable chain for large files)
8. **Support Layer** — GraphAPILogger, cleanup services

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

### 2.3 Class Diagram

![Class Diagram](diagrams/class-diagram.png)

### 2.4 Deployment Diagram

![Deployment Diagram](diagrams/deployment-diagram.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| EmailSenderUtil | Facade, convenience methods, result helpers | Apex static class |
| EmailSenderFactory | Strategy registry, type resolution | Apex static class |
| IEmailSender | Contract interface | Apex interface |
| EmailSenderSalesforce | Native Salesforce sending | Apex class |
| EmailSenderGraphApi | Graph API preparation + dispatch | Apex class |
| MsGraphEmailGateway | HTTP transport, OAuth2, batch | Apex class |
| MsGraphLargeAttachmentSender | Async chunked upload | Apex Queueable |
| GraphAPILogger | Centralized error logging | Apex static class |
| MsGraphOrphanedDraftCleanupService | Draft cleanup logic | Apex class |
| MsGraphOrphanedDraftCleanupScheduler | Schedule wrapper | Apex Schedulable |
| OrphanedCVCleanup | ContentVersion cleanup | Apex Schedulable |
| EmailInboundHandler | Inbound email processing | Apex InboundEmailHandler |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| Any Apex code | EmailSenderUtil | Method call | Sync | Static method invocation |
| EmailSenderUtil | EmailSenderFactory | Method call | Sync | Get sender by type |
| EmailSenderGraphApi | MsGraphEmailGateway | Method call | Sync | Delegate HTTP transport |
| MsGraphEmailGateway | Graph API | HTTPS REST | Sync | Batch/sendMail/upload |
| MsGraphEmailGateway | Azure AD | HTTPS REST | Sync | Token acquisition |
| EmailSenderGraphApi | MsGraphLargeAttachmentSender | System.enqueueJob | Async | Large file handoff |
| MsGraphLargeAttachmentSender | MsGraphLargeAttachmentSender | System.enqueueJob | Async (chain) | Next chunk/attachment |
| Scheduler | Cleanup Services | Schedulable.execute | Scheduled | Daily cleanup |

---

## 3. API Design

### 3.1 Graph API Endpoints Used

| # | Endpoint | Method | Auth | Description |
|---|----------|--------|------|-------------|
| 1 | /users/{userId}/sendMail | POST | Bearer Token | Send email directly |
| 2 | /$atch | POST | Bearer Token | Batch multiple requests |
| 3 | /users/{userId}/messages | POST | Bearer Token | Create draft message |
| 4 | /users/{userId}/messages/{id}/attachments/createUploadSession | POST | Bearer Token | Create upload session |
| 5 | {uploadUrl} | PUT | None (SAS token in URL) | Upload file chunk |
| 6 | /users/{userId}/messages/{id}/send | POST | Bearer Token | Send existing draft |
| 7 | /users/{userId}/messages/{id} | DELETE | Bearer Token | Delete draft |

### 3.2 OAuth2 Token Endpoint

| Attribute | Value |
|-----------|-------|
| Method | POST |
| Path | https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token |
| Content-Type | application/x-www-form-urlencoded |
| Rate Limit | Azure AD limits |

**Request Body:**

```
client_id={clientId}&client_secret={clientSecret}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials
```

**Response — 200 OK:**

```json
{
  "access_token": "eyJ0...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### 3.3 Batch Request Format

**Request Body:**

```json
{
  "requests": [
    {
      "id": "0",
      "method": "POST",
      "url": "/users/{userId}/sendMail",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "message": {
          "subject": "Test",
          "body": { "contentType": "HTML", "content": "<p>Hello</p>" },
          "toRecipients": [{ "emailAddress": { "address": "user@example.com" } }]
        },
        "saveToSentItems": true
      }
    }
  ]
}
```

**Response — 200 OK:**

```json
{
  "responses": [
    { "id": "0", "status": 202, "body": null }
  ]
}
```

### 3.4 Upload Session

**Create Session Request:**

```json
{
  "AttachmentItem": {
    "attachmentType": "file",
    "name": "report.pdf",
    "size": 5242880
  }
}
```

**Upload Chunk:**

Headers: Content-Range: bytes 0-2097151/5242880, Content-Type: application/octet-stream

---

## 4. Database Design

### 4.1 Custom Object: Graph_API_Log__c

```
Object: Graph_API_Log__c
Label: Graph API Log
Name Field: AutoNumber (LOG-{0000})
Sharing: Private
```

**Fields:**

| Field API Name | Type | Length | Required | Description |
|---------------|------|--------|----------|-------------|
| Type__c | Picklist | - | Yes | ERROR, CLEANUP, ORPHANED, INFO |
| Source__c | Text | 255 | No | Originating class name |
| Message__c | Long Text Area | 32768 | No | Primary log message |
| Details__c | Long Text Area | 32768 | No | Stack trace or details |

### 4.2 Custom Metadata Types

**Graph_API_Config__mdt:**

| Field | Type | Purpose |
|-------|------|---------|
| GraphAPI_UserId__c | Text(255) | Microsoft 365 mailbox user ID |
| GraphAPI_TenantId__c | Text(255) | Azure AD Tenant ID |
| GraphAPI_ClientId__c | Text(255) | App Registration Client ID |
| GraphAPI_ClientSecret__c | Text(255) | App Registration Client Secret |

**Email_Sender_Config__mdt:**

| Field | Type | Purpose |
|-------|------|---------|
| Sender_Type__c | Text(50) | Salesforce or GraphAPI |

---

## 5. Class / Module Design

### 5.1 Package Structure

```
force-app/main/default/classes/
+-- IEmailSender.cls                         # Interface (Strategy contract)
+-- EmailSenderFactory.cls                   # Factory + Registry
+-- EmailSenderUtil.cls                      # Facade + Helpers
+-- EmailSenderSalesforce.cls                # Strategy: native Salesforce
+-- EmailSenderGraphApi.cls                  # Strategy: Graph API
+-- MsGraphEmailGateway.cls                  # Gateway: HTTP transport
+-- MsGraphLargeAttachmentSender.cls         # Queueable: async uploads
+-- GraphAPILogger.cls                       # Logger utility
+-- MsGraphOrphanedDraftCleanupService.cls   # Cleanup: orphaned drafts
+-- MsGraphOrphanedDraftCleanupScheduler.cls # Scheduler wrapper
+-- OrphanedCVCleanup.cls                    # Cleanup: orphaned CVs
+-- EmailInboundHandler.cls                  # Inbound email handler
+-- EmailSenderGraphApiTest.cls              # Unit tests
+-- EmailExample.cls                         # Usage examples
+-- EmailBatchExample.cls                    # Batch usage example
```

### 5.2 Key Interfaces

```java
public interface IEmailSender {
    List<Messaging.SendEmailResult> send(List<Messaging.SingleEmailMessage> mails);
    List<Messaging.SendEmailResult> send(List<Messaging.SingleEmailMessage> mails, Boolean allOrNone);
}
```

### 5.3 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Strategy | IEmailSender | Swap transport without changing consumer code |
| Factory | EmailSenderFactory | Centralized sender instantiation + registry |
| Facade | EmailSenderUtil | Single entry point, hides complexity |
| Gateway | MsGraphEmailGateway | Isolate HTTP from business logic (no DML/SOQL) |
| Queueable Chain | MsGraphLargeAttachmentSender | Overcome sync heap/callout limits |
| Singleton-like | Platform Cache token | One token per transaction, cached across transactions |

### 5.4 Error Handling

| Exception | Context | When Thrown |
|-----------|---------|------------|
| EmailSenderException | EmailSenderGraphApi | CMT missing, opt-out REJECT |
| IllegalArgumentException | EmailSenderFactory | Unknown sender type |
| GatewayException | MsGraphEmailGateway | HTTP failures, token failures |
| CleanupException | MsGraphOrphanedDraftCleanupService | Draft delete HTTP failure |

### 5.5 Key Class: EmailSenderGraphApi (Internal Design)

**Inner Classes:**
- PreparedEmail — holds processed email data (payload, merged content, large attachments)
- BulkData — pre-queried shared data (targets, OWA map, signature)
- TemplateResult — rendered template output (subject, htmlBody, textBody)
- MailPayload — split result (inline payload + large attachment list)

**Processing Pipeline:**
1. prepareBulkData() — single-SOQL bulk query for targets, OWA, signature
2. Per-email: opt-out check → template render → merge fields → signature → BCC sender → payload split
3. sendViaGateway() — classify into 3 paths (batch, upload, queueable)
4. ulkSaveActivities() — 4 DML max (EmailMessage, Task, Relations, CVs)

---

## 6. Integration Design

### 6.1 Microsoft Graph API Integration

| Attribute | Value |
|-----------|-------|
| Protocol | HTTPS REST (JSON) |
| Base URL | https://graph.microsoft.com/v1.0 |
| Authentication | OAuth2 Bearer Token (client_credentials) |
| Timeout | 120,000 ms (all calls) |
| Retry Policy | No automatic retry (caller responsibility) |
| Circuit Breaker | None (relies on Platform Cache token refresh) |

**Token Caching Strategy:**

| Aspect | Implementation |
|--------|---------------|
| Cache Key | local.MsGraphGateway.Token |
| Cache Type | Org Cache (Platform Cache) |
| TTL | min(expires_in - 60, 3000) seconds |
| Refresh | Automatic on cache miss |
| Fallback | Re-acquire token on every call (no cache) |

### 6.2 Upload Session Flow

```
Caller → Gateway.sendWithLargeAttachments(payload, attachments)
  1. getAccessToken()
  2. createDraft(token, message) → draftId
  3. For each attachment:
     a. createUploadSession(token, draftId, att) → uploadUrl
     b. uploadInChunks(uploadUrl, att) [2MB chunks]
  4. sendDraft(token, draftId, saveToSentItems) → result
```

### 6.3 Queueable Chain Flow

```
EmailSenderGraphApi:
  1. gateway.createAsyncDraft(payload) → {draftId, token, saveToSentItems}
  2. For each att: gateway.createAsyncUploadSession(token, draftId, att) → uploadUrl
  3. Insert ContentVersion records ([GRAPH_ASYNC] prefix)
  4. System.enqueueJob(MsGraphLargeAttachmentSender) with first attachment

MsGraphLargeAttachmentSender.execute():
  1. Query ContentVersion.VersionData
  2. Upload current chunk (PUT with Content-Range)
  3. If more chunks: re-enqueue self (offset += chunkSize)
  4. If chunk done + more attachments: delete CV, process next
  5. If all done: sendDraft(), delete final CV
  On error: deleteOrphanDraft(), delete CV, log error
```

---

## 7. Security Design

### 7.1 Authentication

OAuth2 client_credentials flow (application-level, no user interaction):
- App Registration in Azure AD with Mail.Send application permission
- Admin consent required (one-time)
- Token valid for ~1 hour (cached in Platform Cache)

### 7.2 Data Protection

| Data Type | At Rest | In Transit | In Logs |
|-----------|---------|------------|---------|
| Client Secret | CMT (platform encrypted) | TLS 1.2+ | Never logged |
| Access Token | Platform Cache (session-scoped) | TLS 1.2+ | Never logged |
| Email Content | Not stored long-term | TLS 1.2+ | Only on error (truncated) |
| Attachments | ContentVersion (temporary) | TLS 1.2+ | Never logged |

### 7.3 Input Validation

| Field | Validation |
|-------|-----------|
| Sender Type | Must be in factory registry (throws if not) |
| Merge field tokens | Regex pattern match, validated against Schema.fields |
| Status codes | normalizeStatusCode() validates against whitelist |
| File size | Checked against heap limit before processing |

---

## 8. Performance and Scalability

### 8.1 Caching Strategy

| Cache | What | TTL | Technology |
|-------|------|-----|------------|
| Token | OAuth2 access_token | min(expires_in-60, 3000)s | Platform Cache |
| Sender | IEmailSender instance | Transaction-scoped | Static variable |
| Bulk Data | Targets, OWA, signature | Transaction-scoped | Local variable |

### 8.2 Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Token from cache | < 5ms | Cache.Org.get() |
| Token acquisition | < 2000ms | HTTP call to Azure AD |
| Batch of 20 emails | < 5000ms | HTTP call to Graph API |
| Single upload chunk (2MB) | < 3000ms | HTTP PUT |
| Full pipeline (20 emails) | < 8000ms | Including token + batch |

### 8.3 Governor Limit Budget

| Limit | Available | Consumed per 20 emails |
|-------|-----------|----------------------|
| Callouts | 100 | 2 (token + batch) or N+2 (upload sessions) |
| DML | 150 | 4 (activity tracking) |
| SOQL | 100 | ~5 (config, targets, OWA, template, signature) |
| Heap (sync) | 6MB | Proportional to email content + attachments |
| Heap (async) | 12MB | Used for large file uploads |

---

## 9. Monitoring and Observability

### 9.1 Logging

| Log Event | Level | Fields | Destination |
|-----------|-------|--------|-------------|
| Send failure | ERROR | Source, message, stack trace | Graph_API_Log__c |
| Orphan detected | ORPHANED | Draft ID, User ID | Graph_API_Log__c |
| Cleanup executed | CLEANUP | CV IDs, count | Graph_API_Log__c |
| Normal operation | INFO | Summary message | Graph_API_Log__c |
| Logger failure | DEBUG | Exception message | System.debug only |

### 9.2 Monitoring Queries

```sql
-- Recent errors
SELECT Type__c, Source__c, Message__c, CreatedDate
FROM Graph_API_Log__c
WHERE Type__c = 'ERROR'
ORDER BY CreatedDate DESC LIMIT 50

-- Pending orphans
SELECT Id, Message__c, CreatedDate
FROM Graph_API_Log__c
WHERE Type__c = 'ORPHANED'
ORDER BY CreatedDate ASC
```

---

## 10. Deployment Considerations

### 10.1 Prerequisites (One-time Setup)

| # | Step | Who |
|---|------|-----|
| 1 | Create Azure AD App Registration (Mail.Send permission) | Azure Admin |
| 2 | Grant Admin Consent in Azure AD | Azure Admin |
| 3 | Create Platform Cache partition "MsGraphGateway" (1KB+ Org) | SF Admin |
| 4 | Add Remote Site Settings for graph.microsoft.com and login.microsoftonline.com | SF Admin |
| 5 | Deploy Apex classes and custom objects | DevOps |
| 6 | Create Graph_API_Config__mdt record "Default" with credentials | SF Admin |
| 7 | Create Email_Sender_Config__mdt record "Default" (Sender_Type__c) | SF Admin |
| 8 | Schedule cleanup jobs (daily at 2:00 and 3:00 AM) | SF Admin |

### 10.2 Rollback Strategy

- Change Email_Sender_Config__mdt.Sender_Type__c to "Salesforce" (instant, no deploy)
- All email sending reverts to native Salesforce immediately
- Cleanup jobs continue to process any remaining orphans

---

## 11. Appendix

### Implementation Checklist

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | IEmailSender.cls | Exists | Interface - 2 methods |
| 2 | EmailSenderFactory.cls | Exists | Factory + registry |
| 3 | EmailSenderUtil.cls | Exists | Facade + helpers |
| 4 | EmailSenderSalesforce.cls | Exists | Native sender |
| 5 | EmailSenderGraphApi.cls | Exists | Graph API sender |
| 6 | MsGraphEmailGateway.cls | Exists | HTTP transport |
| 7 | MsGraphLargeAttachmentSender.cls | Exists | Queueable async |
| 8 | GraphAPILogger.cls | Exists | Logger |
| 9 | MsGraphOrphanedDraftCleanupService.cls | Exists | Draft cleanup |
| 10 | MsGraphOrphanedDraftCleanupScheduler.cls | Exists | Scheduler |
| 11 | OrphanedCVCleanup.cls | Exists | CV cleanup |
| 12 | EmailInboundHandler.cls | Exists | Inbound handler |
| 13 | Graph_API_Log__c + fields | Exists | Custom object |
| 14 | Graph_API_Config__mdt | Required | CMT - credentials |
| 15 | Email_Sender_Config__mdt | Required | CMT - sender type |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture (Layered) | ![Architecture](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | ![Component](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Class Diagram | ![Class Diagram](diagrams/class-diagram.png) | [class-diagram.drawio](diagrams/class-diagram.drawio) |
| 4 | Deployment Diagram | ![Deployment Diagram](diagrams/deployment-diagram.png) | [deployment-diagram.drawio](diagrams/deployment-diagram.drawio) |
