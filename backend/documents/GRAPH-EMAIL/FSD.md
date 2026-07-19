# Functional Specification Document (FSD)

## Microsoft Graph API Email Integration — GRAPH-EMAIL

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | GRAPH-EMAIL |
| Title | Microsoft Graph API Email Integration for Salesforce |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-01-27 |
| Status | Draft |
| Related BRD | BRD-v1-GRAPH-EMAIL.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-27 | BA + TA Agent | Initiate document |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Microsoft Graph API Email Integration system for Salesforce. It details use cases, business rules, data specifications, and integration contracts.

### 1.2 Scope

Covers all email sending, receiving, and maintenance operations described in the BRD.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Graph API | Microsoft Graph REST API v1.0 |
| CMT | Custom Metadata Type |
| OWA | OrgWideEmailAddress |
| CV | ContentVersion |
| DML | Data Manipulation Language (Salesforce insert/update/delete) |
| Queueable | Salesforce async processing interface |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-GRAPH-EMAIL.docx |
| Microsoft Graph Send Mail API | https://learn.microsoft.com/en-us/graph/api/user-sendmail |
| Microsoft Graph Batch API | https://learn.microsoft.com/en-us/graph/json-batching |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The system operates within Salesforce and communicates with Microsoft Graph API for email delivery.

### 2.3 Email Send Sequence

![Sequence - Send Email](diagrams/sequence-send-email.png)

### 2.4 Batch Send with Large Attachments Sequence

![Sequence - Batch Send](diagrams/sequence-batch-send.png)

### 2.5 Email Lifecycle State Diagram

![State - Email Lifecycle](diagrams/state-email-lifecycle.png)

### 2.2 System Architecture

Layered architecture with clear separation:
- **Facade Layer**: EmailSenderUtil (single entry point)
- **Factory Layer**: EmailSenderFactory (strategy selection)
- **Strategy Layer**: IEmailSender implementations
- **Gateway Layer**: MsGraphEmailGateway (HTTP transport)
- **Async Layer**: MsGraphLargeAttachmentSender (Queueable)
- **Support Layer**: GraphAPILogger, cleanup services

---

## 3. Functional Requirements

### 3.1 Feature: Email Sending via Unified API

**Source:** BRD Story 1, 2, 3

#### 3.1.2 Use Case: UC-01 Send Email

**Use Case ID:** UC-01
**Actor:** Developer (Apex code)
**Preconditions:** Graph_API_Config__mdt and Email_Sender_Config__mdt records exist
**Postconditions:** Email delivered, activity tracked if configured

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Calls EmailSenderUtil.send(mails) |
| 2 | | EmailSenderUtil | Reads Email_Sender_Config__mdt for sender type |
| 3 | | EmailSenderFactory | Returns IEmailSender based on type |
| 4 | | IEmailSender | Processes and sends email |
| 5 | | System | Returns List of SendEmailResult |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | CMT record missing | Default to Salesforce sender |
| AF-02 | Explicit type override | Use specified sender type |
| AF-03 | allOrNone=true with failure | Mark failed as ALL_OR_NONE |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Graph_API_Config__mdt missing | Throw EmailSenderException |
| EF-02 | Invalid sender type | Throw IllegalArgumentException |
| EF-03 | OAuth2 token failure | Throw GatewayException |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Default sender type is Salesforce when CMT not found | Story 1 |
| BR-02 | Sender instances cached per-transaction | Story 1 |
| BR-03 | All HTTP callouts must complete before any DML | Governor limits |
| BR-04 | Maximum 20 emails per batch request | Graph API limit |
| BR-05 | Maximum 100 callouts per Apex transaction | Salesforce limit |
| BR-06 | Opt-out EXCLUDE skips send silently | Story 11 |
| BR-07 | Opt-out REJECT throws exception | Story 11 |
| BR-08 | QUEUED status for async emails (>8MB) | Story 5 |
| BR-09 | allOrNone does not rollback already-sent sync emails | Story 12 |
| BR-10 | allOrNone does not affect QUEUED async emails | Story 12 |

#### 3.1.4 Data Specifications

**Input Data (Messaging.SingleEmailMessage):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| toAddresses | List String | Yes* | Valid email format | Recipients (*or targetObjectId) |
| subject | String | Yes | Max 998 chars | Email subject |
| htmlBody | String | No | Valid HTML | HTML content |
| plainTextBody | String | No | - | Plain text content |
| targetObjectId | Id | No | Contact/Lead/User | Merge target |
| whatId | Id | No | Any SObject | Related record |
| templateId | Id | No | Valid EmailTemplate | Template reference |
| orgWideEmailAddressId | Id | No | Valid OWA record | From address override |
| fileAttachments | List | No | Each file has name+body | Attachments |
| saveAsActivity | Boolean | No | - | Track in timeline |
| treatBodiesAsTemplate | Boolean | No | - | Enable merge fields |
| optOutPolicy | String | No | SEND/EXCLUDE/REJECT | Opt-out behavior |
| allOrNone | Boolean | No | - | Transaction semantics |

**Output Data (Messaging.SendEmailResult):**

| Field | Type | Description |
|-------|------|-------------|
| isSuccess | Boolean | True if email sent/queued successfully |
| errors | List SendEmailError | Error details if failed |
| errors[].statusCode | String | QUEUED, ALL_OR_NONE, UNSPECIFIED_EMAIL_ERROR, etc. |
| errors[].message | String | Human-readable error message |

---

### 3.2 Feature: Large Attachment Handling

**Source:** BRD Story 5

#### 3.2.2 Use Case: UC-02 Send Email with Large Attachment

**Use Case ID:** UC-02
**Actor:** System (EmailSenderGraphApi)
**Preconditions:** File attachment size > 3MB
**Postconditions:** Email sent with all attachments, temporary resources cleaned

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | EmailSenderGraphApi | Detects file > 3MB (LARGE_FILE_THRESHOLD) |
| 2 | | EmailSenderGraphApi | Checks heap safety (fileSize + 2MB + 512KB vs limit) |
| 3 | | MsGraphEmailGateway | Creates draft message via POST /users/{id}/messages |
| 4 | | MsGraphEmailGateway | Creates upload session for attachment |
| 5 | | MsGraphEmailGateway | Uploads file in 2MB chunks with Content-Range |
| 6 | | MsGraphEmailGateway | Sends draft via POST /messages/{id}/send |
| 7 | | System | Returns success SendEmailResult |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-04 | File > 8MB or exceeds heap | Route to Queueable async path |
| AF-05 | Multiple large attachments | Process sequentially in same session |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-04 | Upload session fails | Delete draft, return error result |
| EF-05 | Draft delete fails | Log ORPHAN_DRAFT marker for cleanup |
| EF-06 | Heap exceeded during upload | Throw GatewayException |

---

### 3.3 Feature: Async Large File Processing

**Source:** BRD Story 5

#### 3.3.2 Use Case: UC-03 Async Send via Queueable

**Use Case ID:** UC-03
**Actor:** System (EmailSenderGraphApi + MsGraphLargeAttachmentSender)
**Preconditions:** File > 8MB or heap insufficient for sync upload
**Postconditions:** Email queued for async delivery

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | EmailSenderGraphApi | Creates draft on Graph API |
| 2 | | EmailSenderGraphApi | Creates upload sessions for each attachment |
| 3 | | EmailSenderGraphApi | Stores file in ContentVersion ([GRAPH_ASYNC] prefix) |
| 4 | | EmailSenderGraphApi | Enqueues MsGraphLargeAttachmentSender |
| 5 | | System | Returns QUEUED SendEmailResult |
| 6 | | MsGraphLargeAttachmentSender | Reads CV, uploads chunk |
| 7 | | MsGraphLargeAttachmentSender | If more chunks: re-enqueue self |
| 8 | | MsGraphLargeAttachmentSender | If more attachments: process next |
| 9 | | MsGraphLargeAttachmentSender | All done: send draft, delete CV |

---

### 3.4 Feature: Orphaned Resource Cleanup

**Source:** BRD Story 7, 8

#### 3.4.2 Use Case: UC-04 Cleanup Orphaned Drafts

**Use Case ID:** UC-04
**Actor:** System (Scheduled Job)
**Preconditions:** Graph_API_Log__c records with Type=ORPHANED exist older than 1 hour
**Postconditions:** Orphaned drafts deleted from Graph API, log records removed

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Scheduler | | Triggers MsGraphOrphanedDraftCleanupService |
| 2 | | Service | Queries up to 50 ORPHANED logs older than 1 hour |
| 3 | | Service | Gets OAuth2 token |
| 4 | | Service | For each: DELETE /users/{userId}/messages/{draftId} |
| 5 | | Service | Bulk deletes successfully cleaned log records |
| 6 | | Service | Returns count of cleaned drafts |

#### 3.4.3 Use Case: UC-05 Cleanup Orphaned ContentVersions

**Use Case ID:** UC-05
**Actor:** System (Scheduled Job)
**Preconditions:** CVs with [GRAPH_ASYNC] prefix, no publish location, older than 24h
**Postconditions:** Orphaned CVs deleted, cleanup logged

---

### 3.5 Feature: Activity Tracking

**Source:** BRD Story 6

#### 3.5.2 Use Case: UC-06 Save Email Activity

**Use Case ID:** UC-06
**Actor:** System (EmailSenderGraphApi)
**Preconditions:** saveAsActivity=true AND email sent successfully
**Postconditions:** EmailMessage + Task + Relations + Attachment CVs created

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | System | Collects all successful emails with saveAsActivity=true |
| 2 | | System | Bulk inserts EmailMessage records (partial success) |
| 3 | | System | Bulk inserts Task records (partial success) |
| 4 | | System | Bulk inserts EmailMessageRelation for person targets |
| 5 | | System | Bulk inserts ContentVersion for file attachments |

**Business Rules:**

| Rule ID | Rule |
|---------|------|
| BR-11 | Maximum 4 DML statements for activity tracking |
| BR-12 | Database.insert(records, false) for partial success |
| BR-13 | EmailMessageRelation only for Contact/Lead/User (person objects) |
| BR-14 | WhatId goes to EmailMessage.RelatedToId (not relation) |

---

### 3.6 Feature: Inbound Email Processing

**Source:** BRD Story 10

#### 3.6.2 Use Case: UC-07 Process Inbound Email

**Use Case ID:** UC-07
**Actor:** External Email Sender
**Preconditions:** Email Service configured in Salesforce Setup
**Postconditions:** Task created from incoming email

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | External | | Sends email to Salesforce Email Service address |
| 2 | | EmailInboundHandler | Receives InboundEmail + InboundEnvelope |
| 3 | | EmailInboundHandler | Creates Task with subject and body |
| 4 | | EmailInboundHandler | Logs attachment info (debug) |
| 5 | | System | Returns InboundEmailResult(success=true) |

---

## 4. Data Model

### 4.1 Custom Objects

#### Entity: Graph_API_Log__c

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| Name | AutoNumber (LOG-{0000}) | Auto | - | Unique log identifier |
| Type__c | Picklist | Yes | ERROR/CLEANUP/ORPHANED/INFO | Log category |
| Source__c | Text(255) | No | - | Class name that created log |
| Message__c | Long Text | No | - | Primary message |
| Details__c | Long Text | No | - | Stack trace or additional info |

#### Entity: Graph_API_Config__mdt (Custom Metadata Type)

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| DeveloperName | Text | Yes | Record identifier (Default) |
| GraphAPI_UserId__c | Text | Yes | Microsoft 365 user/mailbox ID |
| GraphAPI_TenantId__c | Text | Yes | Azure AD Tenant ID |
| GraphAPI_ClientId__c | Text | Yes | Azure AD App Client ID |
| GraphAPI_ClientSecret__c | Text | Yes | Azure AD App Client Secret |

#### Entity: Email_Sender_Config__mdt (Custom Metadata Type)

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| DeveloperName | Text | Yes | Record identifier (Default) |
| Sender_Type__c | Text | Yes | Salesforce or GraphAPI |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| Graph_API_Log__c | - | Standalone | No FK relationships |
| EmailMessage | Contact/Lead | N:1 | WhoId references person |
| EmailMessage | Account/Case | N:1 | RelatedToId references object |
| ContentVersion | EmailMessage | N:1 | FirstPublishLocationId |

---

## 5. Integration Specifications

### 5.1 External System: Microsoft Graph API

| Attribute | Value |
|-----------|-------|
| Purpose | Send emails via Microsoft 365 shared mailbox |
| Direction | Outbound |
| Data Format | JSON |
| Frequency | Real-time (per email send request) |
| Base URL | https://graph.microsoft.com/v1.0 |

**API Endpoints:**

| # | Endpoint | Method | Purpose |
|---|----------|--------|---------|
| 1 | /users/{userId}/sendMail | POST | Send single email |
| 2 | /$atch | POST | Send batch (up to 20) |
| 3 | /users/{userId}/messages | POST | Create draft |
| 4 | /users/{userId}/messages/{id}/attachments/createUploadSession | POST | Create upload session |
| 5 | {uploadUrl} | PUT | Upload chunk (2MB) |
| 6 | /users/{userId}/messages/{id}/send | POST | Send draft |
| 7 | /users/{userId}/messages/{id} | DELETE | Delete draft |

### 5.2 External System: Azure AD (OAuth2)

| Attribute | Value |
|-----------|-------|
| Purpose | Obtain access token for Graph API |
| Direction | Outbound |
| Data Format | application/x-www-form-urlencoded (request), JSON (response) |
| Frequency | On-demand (cached until expiry) |
| Endpoint | https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token |

**Token Request:**

| Parameter | Value |
|-----------|-------|
| client_id | From Graph_API_Config__mdt |
| client_secret | From Graph_API_Config__mdt |
| scope | https://graph.microsoft.com/.default |
| grant_type | client_credentials |

**Token Caching:**
- Cache key: local.MsGraphGateway.Token
- TTL: expires_in - 60 seconds (max 3000s)
- Storage: Salesforce Platform Cache (Org Cache)

---

## 6. Processing Logic

### 6.1 Email Preparation Process

**Trigger:** EmailSenderGraphApi.send() called
**Input:** List of Messaging.SingleEmailMessage
**Output:** List of PreparedEmail (internal)

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Query Graph_API_Config__mdt | Throw EmailSenderException if missing |
| 2 | Prepare bulk data (targets, OWA, signature) | Continue with defaults |
| 3 | For each email: check opt-out policy | Skip or throw per policy |
| 4 | Resolve template if templateId set | Log error, mark as failed |
| 5 | Resolve fromAddress (OWA or default) | Use default userId |
| 6 | Apply signature if useSignature=true | Skip if no signature |
| 7 | Apply merge fields if treatBodiesAsTemplate | Skip unresolved tokens |
| 8 | Split attachments by size threshold | Classify into 3 paths |
| 9 | Build Graph API JSON payload | Log error, mark as failed |

### 6.2 Batch Sending Process

**Trigger:** Prepared emails ready for sending
**Input:** Map of index to payload

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Group payloads into batches of 20 | - |
| 2 | Get OAuth2 token (cached or fresh) | Throw GatewayException |
| 3 | Build JSON batch request body | - |
| 4 | POST to $atch endpoint (timeout 120s) | Map all to error result |
| 5 | Parse batch response, map by request ID | Missing = error result |
| 6 | Return Map of index to SendEmailResult | - |

### 6.3 Token Acquisition Process

**Trigger:** Token not in cache or expired

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Check Platform Cache for token | If found, return cached |
| 2 | POST to Azure AD token endpoint | Throw GatewayException |
| 3 | Parse response, extract access_token | Throw GatewayException |
| 4 | Cache token with TTL (expires_in - 60, max 3000) | Silent fail (next call retries) |
| 5 | Return token | - |

---

## 7. Security Requirements

### 7.1 Authentication and Authorization

| Role | Permissions | Features |
|------|-------------|----------|
| System (Apex runtime) | Full access to CMT, send email | All email operations |
| Salesforce Admin | Edit CMT, view logs | Configuration, monitoring |
| Azure AD App | Mail.Send (Application) | Send as any user in tenant |

### 7.2 Data Sensitivity

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| OAuth2 Client Secret | Restricted | Stored in CMT (platform-encrypted) |
| Access Token | Confidential | Cached in Platform Cache (org-level) |
| Email Content | Internal | Logged only on error (truncated) |
| Recipient Addresses | Internal | Not logged in plain text |

### 7.3 Audit Trail

| Event | Logged Fields | Retention |
|-------|--------------|-----------|
| Send failure | Source class, error message, details | Graph_API_Log__c (indefinite) |
| Orphan detected | Draft ID, User ID | Until cleanup succeeds |
| Cleanup executed | CV IDs deleted | Single log entry |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Batch of 20 emails < 5 seconds | Measured at Gateway layer |
| Performance | Token acquisition < 2 seconds | Measured at OAuth2 call |
| Availability | Fallback to Salesforce sender | Admin changes CMT value |
| Scalability | 10,000 emails/day | Via scheduled batch jobs |
| Reliability | Orphan cleanup within 24 hours | Scheduled jobs run daily |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| CMT not configured | Critical | EmailSenderException thrown | Developer must configure CMT |
| Token acquisition fails | Critical | GatewayException thrown | Check Azure AD config |
| Batch partial failure | Warning | Individual SendEmailResult.isSuccess=false | Caller handles per-email |
| Opt-out REJECT | Warning | EmailSenderException thrown | Caller catches or lets propagate |
| File too large for sync | Info | QUEUED status returned | Email processed async |
| Upload session fails | Warning | Error SendEmailResult | Draft cleaned up automatically |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Send single email via Graph API | 1 mail, GraphAPI config | isSuccess=true | High |
| TC-02 | Send batch 20 emails | 20 mails | 20 results, batch call | High |
| TC-03 | allOrNone with partial failure | 2 mails, 1 fails | Failed=ALL_OR_NONE | High |
| TC-04 | Template rendering | templateId + targetObjectId | Merged content | High |
| TC-05 | Opt-out EXCLUDE | Opted-out contact | isSuccess=false, no API call | Medium |
| TC-06 | Large attachment (5MB) | File > 3MB | Upload session used | High |
| TC-07 | Very large attachment (10MB) | File > 8MB | QUEUED status | High |
| TC-08 | Token caching | 2 sends in same transaction | 1 token call only | Medium |
| TC-09 | Empty mail list | Empty list | Empty result list | Low |
| TC-10 | Merge fields dynamic | {!Contact.FirstName} | Resolved value | High |

---

## 11. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | ![System Context](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Send Email | ![Sequence Send Email](diagrams/sequence-send-email.png) | [sequence-send-email.drawio](diagrams/sequence-send-email.drawio) |
| 3 | Sequence — Batch Send with Large Attachments | ![Sequence Batch Send](diagrams/sequence-batch-send.png) | [sequence-batch-send.drawio](diagrams/sequence-batch-send.drawio) |
| 4 | State — Email Lifecycle | ![State Email Lifecycle](diagrams/state-email-lifecycle.png) | [state-email-lifecycle.drawio](diagrams/state-email-lifecycle.drawio) |
