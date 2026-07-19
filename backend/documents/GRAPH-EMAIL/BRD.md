# Business Requirements Document (BRD)

## Microsoft Graph API Email Integration — GRAPH-EMAIL

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | GRAPH-EMAIL |
| Title | Microsoft Graph API Email Integration for Salesforce |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-01-27 |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-27 | BA Agent | Initiate document — generated from source code analysis |

---

## 1. Introduction

### 1.1 Scope

This project implements a comprehensive email sending solution for Salesforce that integrates with Microsoft Graph API as an alternative to the native Salesforce email service. The system provides:

- Dual email sender support (Salesforce native and Microsoft Graph API)
- Full Messaging.SingleEmailMessage compatibility (template rendering, merge fields, attachments, CC/BCC, OrgWideEmailAddress)
- Large attachment handling via upload sessions (>3MB) and async Queueable chains (>8MB)
- Batch sending via Graph API $batch endpoint (up to 20 per batch)
- Activity tracking (EmailMessage + Task records for saveAsActivity)
- Orphaned resource cleanup (scheduled jobs for draft messages and ContentVersion records)
- Inbound email processing (Email Service handler)
- Configurable sender selection via Custom Metadata Type

### 1.2 Out of Scope

- Calendar integration via Microsoft Graph API
- Teams messaging integration
- OneDrive/SharePoint file management
- Real-time push notifications from Graph API (webhooks/subscriptions)
- Multi-tenant isolation (single org, single Graph API app registration)

### 1.3 Preliminary Requirement

- Microsoft Entra ID (Azure AD) App Registration with Mail.Send permission (Application type)
- Salesforce Platform Cache partition named "MsGraphGateway" with at least 1KB Org Cache
- Custom Metadata Type Graph_API_Config__mdt with record "Default" configured
- Custom Metadata Type Email_Sender_Config__mdt for sender type selection
- Remote Site Settings for graph.microsoft.com and login.microsoftonline.com

---

## 2. Business Requirements

### 2.1 High Level Process Map

![Business Flow](diagrams/business-flow.png)

The system replaces or supplements Salesforce native email sending with Microsoft Graph API, allowing organizations to:
1. Send emails from a shared mailbox via Graph API (bypassing Salesforce daily email limits)
2. Maintain full compatibility with existing Apex code using Messaging.SingleEmailMessage
3. Seamlessly switch between Salesforce and Graph API senders via configuration
4. Handle large file attachments that exceed Salesforce standard email limits
5. Automatically clean up orphaned resources (draft messages, temporary ContentVersions)

### 2.2 List of User Stories / Use Cases

![Use Case Diagram](diagrams/use-case.png)

| # | Story / Use Case | Priority | Source |
|---|------------------|----------|--------|
| 1 | As a Salesforce Admin, I want to configure which email sender (Salesforce or GraphAPI) is used by default, so that I can control email routing without code changes | MUST HAVE | EmailSenderFactory |
| 2 | As a Developer, I want to send emails via a unified API (EmailSenderUtil) that works identically regardless of the underlying sender | MUST HAVE | EmailSenderUtil |
| 3 | As a Developer, I want Graph API sends to fully support Messaging.SingleEmailMessage features (templates, merge fields, CC/BCC, OrgWideEmailAddress) | MUST HAVE | EmailSenderGraphApi |
| 4 | As a System, I want to send emails in batch (up to 20 per request) via Graph API $batch endpoint to minimize API callouts | MUST HAVE | MsGraphEmailGateway |
| 5 | As a System, I want to handle large file attachments (>3MB) via upload sessions and >8MB via async Queueable chains | MUST HAVE | MsGraphLargeAttachmentSender |
| 6 | As a System, I want to track all sent emails as EmailMessage + Task records when saveAsActivity=true | SHOULD HAVE | EmailSenderGraphApi |
| 7 | As a System, I want to automatically clean up orphaned draft messages on Graph API after failed async sends | SHOULD HAVE | MsGraphOrphanedDraftCleanupService |
| 8 | As a System, I want to automatically clean up orphaned ContentVersion records from failed Queueable chains | SHOULD HAVE | OrphanedCVCleanup |
| 9 | As a System, I want to log all Graph API errors and cleanup operations to Graph_API_Log__c | SHOULD HAVE | GraphAPILogger |
| 10 | As a Developer, I want to process inbound emails via an Email Service handler that creates Tasks | COULD HAVE | EmailInboundHandler |
| 11 | As a System, I want to respect opt-out policies (EXCLUDE/REJECT/SEND) for Contacts and Leads | MUST HAVE | EmailSenderGraphApi |
| 12 | As a System, I want allOrNone semantics for batch sends | MUST HAVE | EmailSenderGraphApi |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Outbound Email Flow (Graph API Path):**

**Step 1:** Business code calls EmailSenderUtil.send(mails) or convenience methods (sendText, sendHtml)

**Step 2:** EmailSenderUtil reads Email_Sender_Config__mdt to determine current sender type

**Step 3:** EmailSenderFactory returns the appropriate IEmailSender implementation

**Step 4:** EmailSenderGraphApi prepares each email — queries bulk data (targets, OWA, signature), resolves templates, merges dynamic fields, resolves fromAddress, splits attachments by size, builds Graph API JSON payload

**Step 5:** Emails sent via MsGraphEmailGateway — small attachments via $batch, medium (3-8MB) via upload session, large (>8MB) via Queueable chain

**Step 6:** Results mapped back to Messaging.SendEmailResult format

**Step 7:** If saveAsActivity=true, bulk insert EmailMessage + Task + EmailMessageRelation + ContentVersion

**Step 8:** If allOrNone=true and any failure, mark failed emails as ALL_OR_NONE (QUEUED emails unchanged)

> Note: All HTTP callouts complete BEFORE any DML operations (Salesforce governor limit compliance)

---

#### STORY 1: Configurable Email Sender Selection

> As a Salesforce Admin, I want to configure which email sender is used by default, so that I can control email routing without code changes.

**Requirement Details:**

1. System reads sender type from Email_Sender_Config__mdt (field: Sender_Type__c)
2. Supported types: "Salesforce" (native) and "GraphAPI" (Microsoft Graph)
3. If CMT record not found or query fails, default to "Salesforce"
4. Sender instances are cached per-transaction (lazy initialization)
5. EmailSenderFactory.register(type, sender) allows runtime extension

**Acceptance Criteria:**

1. When Email_Sender_Config__mdt.Default.Sender_Type__c = 'GraphAPI', all emails route through Graph API
2. When CMT record missing, emails fall back to Salesforce native
3. Changing CMT value takes effect on next transaction without deploy
4. EmailSenderFactory.getAvailableTypes() returns all registered sender types

---

#### STORY 2: Unified Email Sending API

> As a Developer, I want to send emails via a unified API that works identically regardless of the underlying sender.

**Requirement Details:**

1. EmailSenderUtil serves as the single Facade for all email operations
2. Provides convenience builders: newText(), newHtml(), newWithTemplate()
3. Provides convenience senders: sendText(), sendHtml(), sendToContact()
4. Supports explicit sender type override: send(mails, 'GraphAPI')
5. Helper methods: createResult(), isQueued(), normalizeStatusCode()

**Acceptance Criteria:**

1. Existing code using EmailSenderUtil.send(mails) works without modification
2. EmailSenderUtil.sendText('a@b.com', 'Sub', 'Body') returns a single SendEmailResult
3. EmailSenderUtil.isQueued(result) correctly identifies async-queued emails

---

#### STORY 3: Full Messaging.SingleEmailMessage Compatibility via Graph API

> As a Developer, I want Graph API sends to support all Messaging.SingleEmailMessage features.

**Requirement Details:**

1. Template rendering — targetObjectId + templateId + whatId via Messaging.renderStoredEmailTemplate()
2. treatTargetObjectAsRecipient — auto-add target email to To addresses
3. orgWideEmailAddressId — resolve from OrgWideEmailAddress record
4. saveAsActivity — insert EmailMessage + Task + EmailMessageRelation (bulk, partial-success)
5. useSignature — append user Email_Signature__c field
6. bccSender — auto-add sender to BCC list
7. optOutPolicy — EXCLUDE (skip), REJECT (throw), SEND (ignore opt-out)
8. treatBodiesAsTemplate — dynamic SOQL merge fields {!Contact.FirstName}
9. File attachments — inline base64 (3MB or less), upload session (3-8MB), Queueable (>8MB)
10. allOrNone — ALL_OR_NONE for failures, QUEUED for async

**Data Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| toAddresses | List of String | Yes (or targetObjectId) | Recipient email addresses |
| ccAddresses | List of String | No | CC recipients |
| bccAddresses | List of String | No | BCC recipients |
| subject | String | Yes | Email subject (supports merge fields) |
| htmlBody | String | No | HTML email content |
| plainTextBody | String | No | Plain text email content |
| targetObjectId | Id | No | Contact/Lead/User for merge and activity |
| whatId | Id | No | Related record (Account, Case) |
| templateId | Id | No | Email template for rendering |
| orgWideEmailAddressId | Id | No | Sender address override |
| fileAttachments | List of EmailFileAttachment | No | File attachments |
| saveAsActivity | Boolean | No | Track in Activity Timeline |
| treatBodiesAsTemplate | Boolean | No | Enable merge fields |
| treatTargetObjectAsRecipient | Boolean | No | Add target email to To list |
| optOutPolicy | String | No | SEND/EXCLUDE/REJECT |
| bccSender | Boolean | No | Auto-BCC the sender |
| useSignature | Boolean | No | Append user signature |
| allOrNone | Boolean | No | Transactional semantics |

**Acceptance Criteria:**

1. Template rendering resolves all merge fields to actual values
2. treatBodiesAsTemplate=true replaces {!Contact.FirstName} with actual value
3. Opt-out EXCLUDE returns failure result without sending
4. Large files (>3MB) sent via upload session without error
5. Files >8MB queued asynchronously with QUEUED status
6. allOrNone=true marks failures as ALL_OR_NONE status code
7. saveAsActivity creates EmailMessage with correct fields

---

#### STORY 4: Batch Email Sending via $batch Endpoint

> As a System, I want to send emails in batch to minimize API callouts.

**Requirement Details:**

1. Graph API $batch endpoint allows up to 20 requests per batch
2. System groups emails into batches of 20 and sends sequentially
3. OAuth2 token obtained once and reused across all batches
4. Token cached in Platform Cache with TTL = expires_in - 60 seconds
5. HTTP timeout: 120 seconds per batch call

**Acceptance Criteria:**

1. 50 emails sent in 3 batch calls (20 + 20 + 10)
2. Individual failures correctly reported per-index
3. Token cache prevents redundant OAuth2 calls
4. Expired token triggers automatic refresh

---

#### STORY 5: Large Attachment Handling

> As a System, I want to handle large file attachments without hitting Salesforce limits.

**Requirement Details:**

1. Threshold classification: inline (3MB or less), upload session (3-8MB), Queueable (>8MB)
2. Upload session chunking: 2MB per chunk with Content-Range header
3. Heap safety check before upload (fileSize + chunkSize + 512KB margin vs heap limit)
4. Async path: store in ContentVersion with [GRAPH_ASYNC] prefix, create draft, create upload sessions, enqueue Queueable
5. Cleanup on failure: delete draft, log orphan marker, delete CV

**Acceptance Criteria:**

1. 5MB attachment sends successfully via upload session
2. 10MB attachment returns QUEUED and processed by Queueable
3. Failed Queueable logs orphan draft for cleanup
4. Async CVs deleted after successful send
5. Heap guard prevents System.LimitException

---

#### STORY 6: Activity Tracking

> As a System, I want to track sent emails in Activity Timeline.

**Requirement Details:**

1. When saveAsActivity=true and email succeeds: insert EmailMessage + Task + EmailMessageRelation + ContentVersion
2. Uses Database.insert(records, false) for partial success
3. All DML is bulk (max 4 statements, no DML in loops)
4. Activity NOT saved for failed emails or when saveAsActivity=false

**Acceptance Criteria:**

1. Successful email creates EmailMessage + Task + attachment CVs
2. EmailMessage.RelatedToId = whatId, WhoId = targetObjectId
3. Failed email creates no activity records
4. Partial DML failure does not prevent other activities from saving

---

#### STORY 7: Orphaned Draft Cleanup

> As a System, I want to automatically clean up orphaned draft messages.

**Requirement Details:**

1. Identified by Graph_API_Log__c: Type=ORPHANED, Message matches ORPHAN_DRAFT:{draftId}:{userId}, older than 1 hour
2. Process: query up to 50 logs, get token, DELETE each draft, bulk delete logs
3. Scheduled daily at 3:00 AM via MsGraphOrphanedDraftCleanupScheduler
4. All callouts before DML

**Acceptance Criteria:**

1. Drafts older than 1 hour deleted from Graph API
2. Cleaned logs removed from Graph_API_Log__c
3. Failed cleanups logged as ERROR
4. Maximum 50 per execution

---

#### STORY 8: Orphaned ContentVersion Cleanup

> As a System, I want to clean up orphaned ContentVersion records.

**Requirement Details:**

1. CVs with [GRAPH_ASYNC] prefix, FirstPublishLocationId = null, older than 24 hours
2. Each deletion logged to Graph_API_Log__c (Type=CLEANUP)
3. Recommended schedule: daily at 2:00 AM

**Acceptance Criteria:**

1. Orphaned CVs deleted after 24 hours
2. Deletions logged for audit
3. No-orphan run creates single INFO log

---

#### STORY 9: Centralized Logging

> As a System, I want to log all Graph API operations.

**Requirement Details:**

1. Custom object Graph_API_Log__c: Type__c (ERROR/CLEANUP/ORPHANED/INFO), Source__c, Message__c, Details__c
2. AutoNumber name: LOG-{0000}
3. Logger never throws — wraps insert in try-catch
4. Supports optional details parameter

**Acceptance Criteria:**

1. All errors logged with Type=ERROR
2. Orphan detection creates ORPHANED entries
3. Cleanup creates CLEANUP entries
4. Logger failure caught silently

---

#### STORY 10: Inbound Email Processing

> As a Developer, I want to process inbound emails.

**Requirement Details:**

1. Implements Messaging.InboundEmailHandler
2. Creates Task: Subject = [Email] + subject (max 255), Description = sender + body
3. Handles text and binary attachments (debug logged)
4. Returns success/failure result

**Acceptance Criteria:**

1. Incoming email creates Task with correct fields
2. Long subjects truncated to 255 chars
3. Null subject defaults to "Khong co tieu de"
4. Exceptions caught with success=false

---

#### STORY 11: Opt-Out Policy Enforcement

> As a System, I want to respect opt-out policies.

**Requirement Details:**

1. Check HasOptedOutOfEmail on Contact/Lead
2. SEND: ignore opt-out; EXCLUDE: skip silently; REJECT: throw exception
3. Only applies to Contact and Lead (not User)
4. Only when targetObjectId is set

**Acceptance Criteria:**

1. EXCLUDE with opted-out contact returns failure without API call
2. REJECT with opted-out lead throws exception
3. Non-opted-out contacts send normally
4. User targets always send

---

#### STORY 12: AllOrNone Transaction Semantics

> As a System, I want allOrNone semantics for batch sends.

**Requirement Details:**

1. allOrNone=true with failure: successful sync remain SUCCESS, failed get ALL_OR_NONE, QUEUED remain QUEUED
2. allOrNone=false: independent statuses
3. QUEUED distinguishable via EmailSenderUtil.isQueued(result)

**Acceptance Criteria:**

1. allOrNone=true with 1 failure: failed gets ALL_OR_NONE
2. allOrNone=true all success: all report SUCCESS
3. allOrNone=false mixed: independent statuses
4. QUEUED never overwritten to ALL_OR_NONE

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| Microsoft Graph API v1.0 | External API | /users/{id}/sendMail, $batch, upload sessions |
| Azure AD / Entra ID | External Auth | OAuth2 client_credentials token |
| Salesforce Platform Cache | Infrastructure | Token caching (MsGraphGateway partition) |
| Graph_API_Config__mdt | Configuration | Graph API credentials |
| Email_Sender_Config__mdt | Configuration | Sender type selection |
| Remote Site Settings | Configuration | graph.microsoft.com, login.microsoftonline.com |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| Salesforce Admin | Org Admin | Configure CMT, schedule jobs, monitor logs |
| Developer | Apex Dev Team | Use EmailSenderUtil API |
| Azure Admin | IT Infrastructure | Manage App Registration and permissions |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Graph API rate limiting | High | Medium | Batch endpoint + backoff |
| Token expiry during batch | Medium | Low | Cache with TTL margin |
| Queueable chain breaks | Medium | Medium | Orphan cleanup jobs |
| Governor limits (100 callouts) | High | Medium | Batch max 20/request |
| Platform Cache unavailable | Medium | Low | Token re-fetched (degraded perf) |

### 5.2 Assumptions

- Graph API v1.0 remains stable
- Single shared mailbox (one userId) for outbound emails
- Org has sufficient API callout limits
- Platform Cache partition pre-created
- Email volume within Graph API throttling limits

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Batch send <=5s for 20 emails | Graph API response time |
| Performance | Token acquisition <=2s | OAuth2 latency |
| Scalability | Up to 10,000 emails/day | Via batch jobs |
| Security | OAuth2 client_credentials | Application permissions |
| Security | Credentials in CMT (encrypted) | Not in code |
| Monitoring | All errors in Graph_API_Log__c | Queryable/reportable |
| Compliance | Respect HasOptedOutOfEmail | CAN-SPAM/GDPR |
| Storage | Orphans cleaned within 24 hours | Scheduled jobs |

---

## 7. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Graph API | Microsoft Graph REST API v1.0 for Microsoft 365 services |
| Upload Session | Graph API mechanism for uploading large files in 2MB chunks |
| Queueable | Salesforce async processing interface |
| Platform Cache | Salesforce Org Cache for cross-transaction data |
| CMT | Custom Metadata Type — deployable configuration records |
| OrgWideEmailAddress | Shared sender email address record in Salesforce |
| Draft Message | Graph API message created but not yet sent |
| $batch | Graph API endpoint processing multiple requests in one HTTP call |
| Orphaned Draft | Draft on Graph API never sent/deleted due to failure |
| allOrNone | Transactional semantics for batch operations |

### Design Patterns

| Pattern | Class | Purpose |
|---------|-------|---------|
| Strategy | IEmailSender | Abstraction for email transport implementations |
| Factory | EmailSenderFactory | Create/register email sender instances |
| Facade | EmailSenderUtil | Single entry point for all email operations |
| Gateway | MsGraphEmailGateway | HTTP transport isolation (no DML, no SOQL) |
| Queueable Chain | MsGraphLargeAttachmentSender | Async large file processing |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | ![Business Flow](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | ![Use Case](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
