# TÀI LIỆU THAM CHIẾU CÁC LOẠI RULE TRONG PEGA

> Dự án: SDLC-Agents-4-Enterprise — Mô hình nền tảng Pega (hệ thống bài tập HRAppsV2)
> Nguồn: `pega_rules.json` (RAP catalog) + schema `backend/src/modules/pega/schemas/`

## 1. Tổng quan về Pega Rule

Trong Pega, một **Rule** (quy tắc) là đơn vị cấu hình có thể tái sử dụng định nghĩa hành vi
của ứng dụng: flow, activity, class, property, quyết định, tích hợp, UI, bảo mật... Pega lưu trữ
mọi thứ dưới dạng rule (khái niệm *"Everything is a rule"*).

**Rule-Resolve key (khóa phân giải rule):** mỗi instance rule được định danh duy nhất bởi bộ:
`(pxObjClass = Rule-Type, Applies-To class, Rule name, RuleSet, Version)` và được chọn qua
thuật toán *Rule Resolution* (kế thừa lớp, circumstance, thời hạn version, availability).

**RuleSet / Version / Availability:** rule được đóng gói trong **RuleSet** (và **RuleSet Version**)
được cấp bởi **Application** thông qua **Access Group** cho từng **Operator**.


**Tổng số entry trong catalog: 267** (bao gồm các biến thể hoa/thường và 37 node namespace). Số loại rule phân biệt (case-insensitive) ≈ 211.

## 2. Chỉ mục phân loại (Category Index)

| # | Danh mục | Số lượng |
|---|----------|---------:|
| 1 | Process & Case Management (Quy trình & Quản lý Case) | 22 |
| 2 | Data Model (Mô hình dữ liệu) | 20 |
| 3 | Decisioning (Quyết định / Decisioning) | 29 |
| 4 | Integration (Tích hợp) | 41 |
| 5 | User Interface (Giao diện người dùng) | 32 |
| 6 | Security & Access (Bảo mật & Truy cập) | 20 |
| 7 | Reporting (Báo cáo) | 5 |
| 8 | Application & System Administration (Ứng dụng & Quản trị hệ thống) | 34 |
| 9 | Testing & Quality (Kiểm thử & Chất lượng) | 7 |
| 10 | Utilities, Functions & Libraries (Tiện ích & Hàm) | 8 |
| 11 | Correspondence & Content (Thư tín & Nội dung) | 12 |
| 12 | Catalog Namespace Nodes (Non-rule placeholders) | 37 |

## 1. Process & Case Management (Quy trình & Quản lý Case)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `RULE-EDIT-VALIDATE` | Edit Validate: input-format validation rule (e.g. SSN, email) attached to a property. | Any class | pyMethod, pyMessage |
| `RULE-MESSAGE` | Message: reusable system message text (localized, parameterized). | Any class | pyMessage, pyParam |
| `RULE-OBJ-ACTIVITY` | Activity: sequenced step logic (Java/Rule-Connect/flow actions) executed by the engine. | Any class (Applies-To) | pxObjClass, pyActivityName, Param, Steps, Pages&Classes, Java |
| `RULE-OBJ-ATTACHMENTCATEGORY` | Attachment Category: classifies case attachments (category + security). | Work- class | pyCategory, pyAttachmentType |
| `RULE-OBJ-CASETYPE` | Case Type: defines the case structure - stages, steps, data model, SLA and channels. | Work- class (case) | pyClassName, pyStages, pySteps, DataModel, SLAs |
| `RULE-OBJ-FLOW` | Flow: visual process/workflow defining assignments, routers, subprocesses and automations for a case. | Work/Case class | pxObjClass, FlowName, ShapeConnectors, Subprocess, Assignments |
| `RULE-OBJ-FLOWACTION` | Flow Action: the form+processing performed at an assignment (local action or connector flow action). | Work- class | pyFlowAction, Section, Activity, PreActivity, PostActivity |
| `RULE-OBJ-VALIDATE` | Validate rule: server-side validation logic for a class (property checks / messages). | Any class | pyPropertyName, pyValidation, Messages |
| `RULE-OBJ-WORKPARTIES` | Work Parties: defines the roles/parties (customer, operator) participating in a case. | Work- class | pyWorkParty, Role, PartyClass |
| `Rule-Edit-Input` | Edit Input: input conversion/formatting rule for a property. | Any class | pyMethod |
| `Rule-Edit-Validate` | Edit Validate: input-format validation rule (e.g. SSN, email) attached to a property. | Any class | pyMethod, pyMessage |
| `Rule-Message` | Message: reusable system message text (localized, parameterized). | Any class | pyMessage, pyParam |
| `Rule-Obj-Activity` | Activity: sequenced step logic (Java/Rule-Connect/flow actions) executed by the engine. | Any class (Applies-To) | pxObjClass, pyActivityName, Param, Steps, Pages&Classes, Java |
| `Rule-Obj-AttachmentCategory` | Attachment Category: classifies case attachments (category + security). | Work- class | pyCategory, pyAttachmentType |
| `Rule-Obj-CaseType` | Case Type: defines the case structure - stages, steps, data model, SLA and channels. | Work- class (case) | pyClassName, pyStages, pySteps, DataModel, SLAs |
| `Rule-Obj-Flow` | Flow: visual process/workflow defining assignments, routers, subprocesses and automations for a case. | Work/Case class | pxObjClass, FlowName, ShapeConnectors, Subprocess, Assignments |
| `Rule-Obj-FlowAction` | Flow Action: the form+processing performed at an assignment (local action or connector flow action). | Work- class | pyFlowAction, Section, Activity, PreActivity, PostActivity |
| `Rule-Obj-ServiceLevel` | Service Level (SLA): defines goal/deadline timing and escalation for assignments/cases. | Work- class | pyGoal, pyDeadline, pyEscalateActivity |
| `Rule-Obj-Stage` | Stage: a phase container within a Case Type (e.g. Intake, Processing, Resolution). | Work- case class | pyStageName, pySteps, pyType |
| `Rule-Obj-Ticket` | Ticket: an event/signal used to wake up waiting flows (e.g. approval). | Work- class | pyTicketName, pyTicketAPI |
| `Rule-Obj-Validate` | Validate rule: server-side validation logic for a class (property checks / messages). | Any class | pyPropertyName, pyValidation, Messages |
| `Rule-Obj-WorkParties` | Work Parties: defines the roles/parties (customer, operator) participating in a case. | Work- class | pyWorkParty, Role, PartyClass |

## 2. Data Model (Mô hình dữ liệu)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `DATA-ADMIN-DB-CLASSGROUP` | DB Class Group: groups concrete classes into one physical table. | Data-Admin-DB-ClassGroup | pyClassGroup, pyDefaultClass |
| `DATA-ADMIN-DB-TABLE` | DB Table: maps a class to a database table (exposes columns). | Data-Admin-DB-Table | pyDBName, pyTableName, pyClass |
| `RULE-CLASSMETADATA` | Class Metadata: metadata annotations for a class. | @baseclass | pyClassName |
| `RULE-DATAOBJECT` | Data Object: defines a data type / data model entity. | Data- class | pyClassName, Properties |
| `RULE-OBJ-ASSOCIATION` | Association rule for report joins. | Report class | pyAssociation |
| `RULE-OBJ-CLASS` | Class: the fundamental data-model building block (Work-/Data-/Rule-Obj-). | @baseclass / ancestor | pyClassName, pyDerivesFrom, pyAppliesTo, pyClassGroup |
| `RULE-OBJ-FIELDVALUE` | Field Value: localized label/field text keyed by field/value/class. | Any class | pyField, pyValue, pyLabel |
| `RULE-OBJ-MODEL` | Data Transform: declarative mapping/transformation that sets property values and calls rules. | Any class | pySteps, Set, Apply-DataTransform, Pages |
| `RULE-OBJ-PROPERTY` | Property: a field/attribute defined on a class (Single/Page/Value List...). | Any class | pyPropertyName, pyType, pyTable, pyReferenceProperty |
| `Data-Admin-DB-ClassGroup` | DB Class Group: groups concrete classes into one physical table. | Data-Admin-DB-ClassGroup | pyClassGroup, pyDefaultClass |
| `Data-Admin-DB-Table` | DB Table: maps a class to a database table (exposes columns). | Data-Admin-DB-Table | pyDBName, pyTableName, pyClass |
| `Rule-Obj-Association` | Association rule for report joins. | Report class | pyAssociation |
| `Rule-Obj-Class` | Class: the fundamental data-model building block (Work-/Data-/Rule-Obj-). | @baseclass / ancestor | pyClassName, pyDerivesFrom, pyAppliesTo, pyClassGroup |
| `Rule-Obj-FieldValue` | Field Value: localized label/field text keyed by field/value/class. | Any class | pyField, pyValue, pyLabel |
| `Rule-Obj-MapValue` | Map Value: key/value lookup table (one or two keys) returning a result. | Any class | pyMapKey, pyResult, pySource |
| `Rule-Obj-Model` | Data Transform: declarative mapping/transformation that sets property values and calls rules. | Any class | pySteps, Set, Apply-DataTransform, Pages |
| `Rule-Obj-Property-Alias` | Defines the Property Alias rule. | Resolved by Rule-Resolve key (Applies-To class / RuleSet / Version). | pxObjClass, pyRuleName, pyDescription, RuleSet, Version |
| `Rule-Obj-Property-Qualifier` | Defines the Property Qualifier rule. | Resolved by Rule-Resolve key (Applies-To class / RuleSet / Version). | pxObjClass, pyRuleName, pyDescription, RuleSet, Version |
| `Rule-Obj-Property` | Property: a field/attribute defined on a class (Single/Page/Value List...). | Any class | pyPropertyName, pyType, pyTable, pyReferenceProperty |
| `Rule-Obj-XML` | XML rule: defines XML structure / parse/stream mapping for a class. | Any class | pyXMLStream, Elements |

## 3. Decisioning (Quyết định / Decisioning)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `RULE-DECLARE-DECISIONTABLE` | Decision Table: tabular if/then rules returning a result. | Any class | pyDecisionTable, Conditions, Return |
| `RULE-DECLARE-EXPRESSIONS` | Declare Expressions: declarative property computations (forward chaining). | Any class | pyExpression, pyTargetProperty |
| `RULE-DECLARE-INDEX` | Declare Index: declares a concrete index class for a Page List property. | Any class | pyIndexClass, pyIndexedClass |
| `RULE-DECLARE-PAGES` | Declare Pages: defines node/requestor/thread-level data pages. | Any class | pyPageName, pyScope, Source |
| `RULE-DECLARE-TRIGGER` | Declare Trigger: fires an activity on DB events (save/delete). | Any class | pyTrigger, Activity |
| `RULE-OBJ-WHEN` | When rule: reusable boolean condition expression evaluated at runtime. | Any class | pyExpr, pyDescription |
| `Rule-Declare-DecisionTree` | Decision Tree: hierarchical branching decision logic. | Any class | pyDecisionTree, Branches |
| `Rule-Obj-When` | When rule: reusable boolean condition expression evaluated at runtime. | Any class | pyExpr, pyDescription |
| `Rule-Decision-AdaptiveModel` | Adaptive Model: self-learning adaptive model. | @baseclass | pyModel |
| `Rule-Decision-DataSet` | Data Set: source/target for data (DB, HDFS, Kafka...). | @baseclass | pyDataSet, Source |
| `Rule-Decision-DDF` | Decision Data Filter: filters decision data. | @baseclass | pyFilter |
| `Rule-Decision-DecisionData` | Decision Data: decision data records. | @baseclass | pyDecisionData |
| `Rule-Decision-Interaction` | Interaction: decisioning interaction strategy. | @baseclass | pyInteraction |
| `Rule-Decision-PredictiveModel` | Predictive Model: imported predictive model (PMML). | @baseclass | pyModel |
| `Rule-Decision-Scorecard` | Scorecard: scorecard model. | @baseclass | pyScorecard |
| `Rule-Decision-Strategy` | Decision Strategy: visual strategy canvas for decisioning. | @baseclass | pyStrategy, Shapes |
| `Rule-Declare-CaseMatch` | Declare CaseMatch: matches case/string patterns. | Any class | pyPatterns |
| `Rule-Declare-Collection` | Declare Collection: groups data pages / sources for a data view. | Any class | pyCollection, Sources |
| `Rule-Declare-Constraint` | Declare Constraint: declarative constraint validation on a class. | Any class | pyConstraint, pyMessage |
| `Rule-Declare-Constraints` | Declare Constraints: set of constraint rules. | Any class | pyConstraints |
| `Rule-Declare-DecisionTable` | Decision Table: tabular if/then rules returning a result. | Any class | pyDecisionTable, Conditions, Return |
| `Rule-Declare-DecisionTree` | Decision Tree: hierarchical branching decision logic. | Any class | pyDecisionTree, Branches |
| `Rule-Declare-Expressions` | Declare Expressions: declarative property computations (forward chaining). | Any class | pyExpression, pyTargetProperty |
| `Rule-Declare-Index` | Declare Index: declares a concrete index class for a Page List property. | Any class | pyIndexClass, pyIndexedClass |
| `Rule-Declare-OnChange` | Declare OnChange: action fired when a property changes. | Any class | pyProperty, Activity |
| `Rule-Declare-Pages` | Declare Pages: defines node/requestor/thread-level data pages. | Any class | pyPageName, pyScope, Source |
| `Rule-Declare-Trigger` | Declare Trigger: fires an activity on DB events (save/delete). | Any class | pyTrigger, Activity |
| `Rule-Declare-When` | Declare When: declarative when condition (reuse). | Any class | pyExpr |
| `Rule-Obj-When` | When rule: reusable boolean condition expression evaluated at runtime. | Any class | pyExpr, pyDescription |

## 4. Integration (Tích hợp)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `DATA-ADMIN-CONNECT-FILELISTENER` | Connect File Listener: file listener configuration. | Data-Admin-Connect-FileListener | pyDirectory, Activity |
| `DATA-CHANNEL-MASHUP` | Channel Mashup: mashup channel configuration. | Data-Channel-Mashup | pyChannel |
| `DATA-INTEGRATIONSYSTEM` | Integration System: named external system config. | Data-IntegrationSystem | pySystem, Endpoints |
| `RULE-CONNECT-REST` | Connect REST: outbound REST service connector. | Any class | pyURL, Method, Request, Response |
| `RULE-PARSE-DELIMITED` | Parse Delimited: parses delimited (CSV) text into clipboard. | Any class | pyDelimiter, pyStream |
| `RULE-SERVICE-FILE` | Service File: file-listener driven service. | Any class | pyFileName, Activity |
| `RULE-SERVICE-REST` | Service REST: exposes a Pega REST service endpoint. | Any class | pyURI, Method, Activity |
| `Rule-Connect-REST` | Connect REST: outbound REST service connector. | Any class | pyURL, Method, Request, Response |
| `Rule-Connect-AuthProfile` | Connect AuthProfile: authentication profile for connectors. | Any class | pyAuthType |
| `Rule-Connect-CMIS` | Connect CMIS: Content Management Interop connector. | Any class | pyRepository |
| `Rule-Connect-dotNet` | Connect .NET: invokes a .NET assembly. | Any class | pyAssembly |
| `Rule-Connect-EJB` | Connect EJB: Enterprise JavaBean connector. | Any class | pyJNDI |
| `Rule-Connect-File` | Connect File: read/write files on the server filesystem. | Any class | pyFileName, pyFileType |
| `Rule-Connect-HTTP` | Connect HTTP: generic HTTP connector. | Any class | pyURL, Method |
| `Rule-Connect-Java` | Connect Java: invokes a Java class/method. | Any class | pyJavaClass |
| `Rule-Connect-JCA` | Connect JCA: J2EE Connector Architecture connector. | Any class | pyJNDI |
| `Rule-Connect-JMS` | Connect JMS: outbound JMS message connector. | Any class | pyQueue, pyTopic |
| `Rule-Connect-MQ` | Connect MQ: IBM MQ connector. | Any class | pyQueueManager |
| `Rule-Connect-REST` | Connect REST: outbound REST service connector. | Any class | pyURL, Method, Request, Response |
| `Rule-Connect-SOAP` | Connect SOAP: outbound SOAP/web-service connector. | Any class | pyService, Port, SOAP |
| `Rule-Connect-SQL` | Connect SQL: direct SQL execution against a database. | Any class | pySQL, pyDB |
| `Rule-Map-Structured` | Map Structured: maps structured data to clipboard. | Any class | pyMap |
| `Rule-Parse-Delimited` | Parse Delimited: parses delimited (CSV) text into clipboard. | Any class | pyDelimiter, pyStream |
| `Rule-Parse-Infer` | Parse Infer: infers mapping from sample data. | Any class | pySample |
| `Rule-Parse-Normalize` | Parse Normalize: normalizes parsed data. | Any class | pyMap |
| `Rule-Parse-Structured` | Parse Structured: parses positional/cobol-like text. | Any class | pyMap, pyStream |
| `Rule-Parse-Transform` | Parse Transform: transforms parsed structure. | Any class | pyTransform |
| `Rule-Parse-TransformCollection` | Parse Transform Collection: groups transform steps. | Any class | pyCollection |
| `Rule-Parse-XML` | Parse XML: parses XML into clipboard pages. | Any class | pyRootElement, pyMap |
| `Rule-RDB-SQL` | RDB SQL: SQL statement rule for Connect SQL. | Any class | pySQL, pyDB |
| `Rule-Service-EJB` | Service EJB: EJB listener service. | Any class | pyJNDI |
| `Rule-Service-Email` | Service Email: email listener service. | Any class | pyEmailAccount |
| `Rule-Service-File` | Service File: file-listener driven service. | Any class | pyFileName, Activity |
| `Rule-Service-HTTP` | Service HTTP: exposes an HTTP service. | Any class | pyURI |
| `Rule-Service-Java` | Service Java: Java entry service. | Any class | pyJavaClass |
| `Rule-Service-JMS` | Service JMS: JMS listener service. | Any class | pyQueue |
| `Rule-Service-JSR94` | Service JSR94: rule engine service (JSR-94). | Any class | pyRuleSet |
| `Rule-Service-MQ` | Service MQ: MQ listener service. | Any class | pyQueueManager |
| `Rule-Service-Portlet` | Service Portlet: portlet service. | Any class | pyPortlet |
| `Rule-Service-REST` | Service REST: exposes a Pega REST service endpoint. | Any class | pyURI, Method, Activity |
| `Rule-Service-SOAP` | Service SOAP: exposes a SOAP web service. | Any class | pyService, Port |

## 5. User Interface (Giao diện người dùng)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `RULE-HTML-HARNESS` | Harness: top-level UI container (perform/default/tab/group) for a work item/portal. | Work/Data/Portal class | pyHTMLStream, Sections, Skin |
| `RULE-HTML-PARAGRAPH` | HTML Paragraph: reusable rich-text/HTML content block. | Any class | pyHTMLStream, Parameters |
| `RULE-HTML-SECTION` | Section: reusable UI building block composed of layouts/controls. | Any class | pyHTMLStream, Layouts, Controls, Properties |
| `RULE-NAVIGATION` | Navigation: defines menu/navigation structure for a portal. | Portal/Application | pyNavigation, MenuItems |
| `RULE-OBJ-HTML` | HTML rule: hand-authored HTML/JS fragment (harness/section backend). | Any class | pyHTMLStream |
| `RULE-PORTAL` | Portal: defines the operator landing page / portal layout. | Operator/Application | pyPortal, Harness, Skin |
| `RULE-UI-LOCALIZATION` | UI Localization: field/label localization for the UI layer. | Any class | pyField, pyLabel |
| `RULE-UI-PARAGRAPH` | UI Paragraph: paragraph content for DX UI. | Any class | pyParagraph, Parameters |
| `RULE-UI-ROUTING` | UI Routing: dynamic section/control routing by property value. | Any class | pyRoutingProperty, pyMap |
| `RULE-UI-VIEW` | UI View: modern (DX) view rule defining record/form presentation. | Any class | pyView, Fields, Sections |
| `Rule-HTML-FlowAction` | Defines the Html Flowaction rule. | Resolved by Rule-Resolve key (Applies-To class / RuleSet / Version). | pxObjClass, pyRuleName, pyDescription, RuleSet, Version |
| `Rule-HTML-Fragment` | HTML Fragment: shared HTML/JS snippet included by other rules. | Any class | pyHTMLStream |
| `Rule-HTML-Harness` | Harness: top-level UI container (perform/default/tab/group) for a work item/portal. | Work/Data/Portal class | pyHTMLStream, Sections, Skin |
| `Rule-HTML-Property` | HTML Property: custom control/HTML presentation for a property. | Any class | pyControl, pyHTMLStream |
| `Rule-HTML-Section` | Section: reusable UI building block composed of layouts/controls. | Any class | pyHTMLStream, Layouts, Controls, Properties |
| `Rule-Map-Eform` | Map EForm: maps electronic form data. | Any class | pyEForm |
| `Rule-Navigation` | Navigation: defines menu/navigation structure for a portal. | Portal/Application | pyNavigation, MenuItems |
| `Rule-Obj-HTML` | HTML rule: hand-authored HTML/JS fragment (harness/section backend). | Any class | pyHTMLStream |
| `Rule-Obj-Section` | Defines the Section rule. | Resolved by Rule-Resolve key (Applies-To class / RuleSet / Version). | pxObjClass, pyRuleName, pyDescription, RuleSet, Version |
| `Rule-PegaQ-Question` | Question: a single questionnaire question. | @baseclass | pyQuestion, pyType |
| `Rule-PegaQ-QuestionCollection` | Question Collection: groups questions. | @baseclass | pyQuestions |
| `Rule-PegaQ-QuestionGroup` | Question Group: groups question collections. | @baseclass | pyGroups |
| `Rule-PegaQ-Questionnaire` | Questionnaire: full questionnaire definition. | @baseclass | pyQuestionnaire |
| `Rule-PegaQ-SurveyBuilder` | Survey Builder: builds surveys from questionnaires. | @baseclass | pySurvey |
| `Rule-Portal` | Portal: defines the operator landing page / portal layout. | Operator/Application | pyPortal, Harness, Skin |
| `Rule-PortalSkin` | Portal Skin: skin settings for a portal. | Application | pySkin |
| `Rule-Shortcut` | Shortcut: portal shortcut link. | Portal | pyShortcut |
| `Rule-UI-Component` | UI Component: reusable custom UI component (DX API). | Any class | pyComponent |
| `Rule-UI-Paragraph` | UI Paragraph: paragraph content for DX UI. | Any class | pyParagraph, Parameters |
| `Rule-UI-Theme` | UI Theme: visual theme/skin settings for the application UI. | Application | pyTheme |
| `Rule-UI-View` | UI View: modern (DX) view rule defining record/form presentation. | Any class | pyView, Fields, Sections |
| `Rule-HTML-Section` | Section: reusable UI building block composed of layouts/controls. | Any class | pyHTMLStream, Layouts, Controls, Properties |

## 6. Security & Access (Bảo mật & Truy cập)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `DATA-ADMIN-OPERATOR-ACCESSGROUP` | Access Group: maps operator to Application + roles + default ruleset. | Data-Admin-Operator-AccessGroup | pyAccessGroup, Application, Roles, Rulesets |
| `DATA-ADMIN-SECURITY-AUTHENTICATIONPROFILE` | Authentication Profile: reusable credentials/auth config for connectors. | Data-Admin-Security-AuthenticationProfile | pyAuthType, pyCredentials |
| `DATA-ADMIN-SECURITY-OAUTH2-REGISTEREDAPPLICATION` | OAuth2 Registered App: registered OAuth2 client/resource server config. | Data-Admin-Security-OAuth2-RegisteredApplication | pyClientID, pyTokenEndpoint |
| `DATA-APPLICATION-OAUTH2CLIENTREGISTRATION` | OAuth2 Client Registration: app-level OAuth2 client registration. | Data-Application-OAuth2ClientRegistration | pyClientID, pyScope |
| `RULE-ACCESS-POLICY` | Access Policy: column-level/record-level security policy for a class. | Work/Data class | pyObjClass, pyPolicy, pyAccessPolicyCondition |
| `RULE-ACCESS-POLICYCONDITION` | Access Policy Condition: condition expression for an Access Policy. | Work/Data class | pyCondition, pyPropertyName |
| `RULE-ACCESS-PRIVILEGE` | Privilege: named capability granted by Access Roles to protect rules. | Any class | pyPrivilege, pyDescription |
| `RULE-ACCESS-ROLE-NAME` | Access Role Name: defines privilege grants + production ruleset for a role. | @baseclass | pyRoleName, Privileges, RuleSet |
| `RULE-ACCESS-ROLE-OBJ` | Access Role Object: object-level access (read/write/delete) per class. | @baseclass | pyObjClass, pyAccess, pyRole |
| `RULE-ACCESS-WHEN` | Access When: conditional access restriction (boolean) on a rule. | Any class | pyExpr |
| `Data-Admin-AccessGroup` | Defines the Admin Accessgroup rule. | Resolved by Rule-Resolve key (Applies-To class / RuleSet / Version). | pxObjClass, pyRuleName, pyDescription, RuleSet, Version |
| `Data-Admin-Operator-ID` | Operator ID: defines a user account, access group, skills and credentials. | Data-Admin-Operator-ID | pyUserIdentifier, AccessGroup, pyPassword |
| `Rule-Access-Deny-Obj` | Access Deny Object: explicit deny of object access per class/role. | @baseclass | pyObjClass, pyDeny |
| `Rule-Access-Privilege` | Privilege: named capability granted by Access Roles to protect rules. | Any class | pyPrivilege, pyDescription |
| `Rule-Access-Role-Name` | Access Role Name: defines privilege grants + production ruleset for a role. | @baseclass | pyRoleName, Privileges, RuleSet |
| `Rule-Access-Role-Obj` | Access Role Object: object-level access (read/write/delete) per class. | @baseclass | pyObjClass, pyAccess, pyRole |
| `Rule-Access-Setting` | Defines the Access Setting rule. | Resolved by Rule-Resolve key (Applies-To class / RuleSet / Version). | pxObjClass, pyRuleName, pyDescription, RuleSet, Version |
| `Rule-Access-When` | Access When: conditional access restriction (boolean) on a rule. | Any class | pyExpr |
| `Rule-Security-VA` | Security VA: security vulnerability assessment rule. | @baseclass | pyCheck |
| `Rule-SecurityVA-Regex` | Security VA Regex: regex-based vulnerability/security validation. | @baseclass | pyRegex |

## 7. Reporting (Báo cáo)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `RULE-OBJ-REPORT-DEFINITION` | Report Definition: SQL-like query/report against a class (filters, joins, charts). | Report/Data class | pyReportName, pyColumns, pyFilters, pySorting |
| `Rule-Obj-List` | Obj-List / List rule: legacy list view alias. | Any class | pyColumns |
| `Rule-Obj-ListView` | List View: legacy list report definition (grid display). | Any class | pyColumns, pySelection |
| `Rule-Obj-Report-Definition` | Report Definition: SQL-like query/report against a class (filters, joins, charts). | Report/Data class | pyReportName, pyColumns, pyFilters, pySorting |
| `Rule-Obj-SummaryView` | Summary View: legacy summarized aggregate report. | Any class | pyGroupBy, pyAggregate |

## 8. Application & System Administration (Ứng dụng & Quản trị hệ thống)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `DATA-ADMIN-ORGDIVISION` | Org Division: organization division record. | Data-Admin-OrgDivision | pyDivision |
| `DATA-ADMIN-ORGUNIT` | Org Unit: organization unit record. | Data-Admin-OrgUnit | pyUnit |
| `DATA-ADMIN-SERVICEPACKAGE` | Service Package: groups service endpoints + access. | Data-Admin-ServicePackage | pyPackage, pyAccessGroup |
| `DATA-ADMIN-SYSTEM-SETTINGS` | System Settings: dynamic system setting value. | Data-Admin-System-Settings | pySetting, pyValue |
| `DATA-APPLICATION-FEATURE` | Application Feature: toggles a feature in an application. | Data-Application-Feature | pyFeature, pyEnabled |
| `DATA-APPMETADATA` | App Metadata: application metadata record. | Data-AppMetadata | pyMetadata |
| `DATA-CONFIGURATION-SETTING` | Configuration Setting: environment configuration value. | Data-Configuration-Setting | pySetting, pyValue |
| `DATA-METADATA-IMPORTTEMPLATE` | Metadata Import Template: template for metadata import. | Data-Metadata-ImportTemplate | pyTemplate |
| `DATA-RULE-APPMETADATA` | Rule App Metadata: rule-level app metadata. | Data-Rule-AppMetadata | pyMetadata |
| `DATA-TAG-RELEVANTRECORD` | Tag Relevant Record: tags rules as relevant records. | Data-Tag-RelevantRecord | pyTag |
| `RULE-ADMIN-PRODUCT` | Product (RAP): packages rules/data for export/import across environments. | Rule-Admin-Product | pyName, RuleSetVersions, File |
| `RULE-ADMIN-SYSTEM-SETTINGS` | System Settings (admin): environment-level setting values. | Rule-Admin-System-Settings | pySetting, pyValue |
| `RULE-APPLICATION` | Application: top-level definition - built-on apps, rulesets, access groups, portal. | Rule-Application | pyApplication, pyRulesets, pyAccessGroups, pyPortal |
| `RULE-ASYNC-JOBSCHEDULER` | Job Scheduler: scheduled background job (cron-like). | @baseclass | pySchedule, Activity |
| `RULE-RULESET-NAME` | RuleSet: a container/versioned package of rules. | Rule-RuleSet-Name | pyRuleSet, pyVersion, pyUseFor |
| `RULE-RULESET-VERSION` | RuleSet Version: a specific versioned slice of a RuleSet (availability window). | Rule-RuleSet-Version | pyRuleSet, pyVersion, pyStartDate, pyEndDate |
| `Rule-Admin-Extract` | Admin Extract: defines a database extract (BLOB->table). | @baseclass | pyExtractClass |
| `Rule-Admin-Product` | Product (RAP): packages rules/data for export/import across environments. | Rule-Admin-Product | pyName, RuleSetVersions, File |
| `Rule-Admin-Skill` | Admin Skill: defines an operator skill. | @baseclass | pySkill |
| `Rule-Admin-System-Settings` | System Settings (admin): environment-level setting values. | Rule-Admin-System-Settings | pySetting, pyValue |
| `Rule-Admin-System` | Admin System: defines a system node record. | @baseclass | pySystemName |
| `Rule-Agent-Queue` | Agent Queue: defines a queue-based agent (background processing). | @baseclass | pyAgentName, Activity, QueueClass |
| `Rule-Application-Requirement` | Application Requirement: requirement tracking on an app. | Rule-Application-Requirement | pyRequirement |
| `Rule-Application-UseCase` | Application UseCase: use-case tracking on an app. | Rule-Application-UseCase | pyUseCase |
| `Rule-Application` | Application: top-level definition - built-on apps, rulesets, access groups, portal. | Rule-Application | pyApplication, pyRulesets, pyAccessGroups, pyPortal |
| `Rule-Async-JobScheduler` | Job Scheduler: scheduled background job (cron-like). | @baseclass | pySchedule, Activity |
| `Rule-Async-QueueProcessor` | Queue Processor: async queue processing of items. | @baseclass | pyQueueClass, Activity |
| `Rule-Category` | Category: groups rules into a category for the Category rule. | @baseclass | pyCategory |
| `Rule-Circumstance-Definition` | Circumstance Definition: defines circumstance templates (date/property). | @baseclass | pyCircumstanceType |
| `Rule-Circumstance-Template` | Circumstance Template: template for circumstance-based rule variants. | @baseclass | pyTemplate |
| `Rule-Define-Hierarchy` | Define Hierarchy: defines organization/division/unit hierarchy. | @baseclass | pyOrg, pyDivision, pyUnit |
| `Rule-Obj-Batch` | Batch: defines batch processing configuration for a class. | Any class | pyBatchName |
| `Rule-RuleSet-Name` | RuleSet: a container/versioned package of rules. | Rule-RuleSet-Name | pyRuleSet, pyVersion, pyUseFor |
| `Rule-RuleSet-Version` | RuleSet Version: a specific versioned slice of a RuleSet (availability window). | Rule-RuleSet-Version | pyRuleSet, pyVersion, pyStartDate, pyEndDate |

## 9. Testing & Quality (Kiểm thử & Chất lượng)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `RULE-TEST-SUITE` | Test Suite: groups test cases/runs for regression. | @baseclass | pyTestSuite, Cases |
| `RULE-TEST-UNIT-CASE` | Unit Test Case: unit test for a rule (activity/declarative...). | @baseclass | pyTestCase, RuleRef |
| `Rule-AutoTest-Case-FlowMarker` | Automated Test Case Flow Marker: marks flow steps in a test. | Work- class | pyFlowMarker |
| `Rule-AutoTest-Case` | Automated Test Case: records/plays back case behavior. | Work- class | pyCaseType, Steps |
| `Rule-AutoTest-Suite` | Automated Test Suite: groups automated test cases. | @baseclass | pySuite |
| `Rule-Test-Suite` | Test Suite: groups test cases/runs for regression. | @baseclass | pyTestSuite, Cases |
| `Rule-Test-Unit-Case` | Unit Test Case: unit test for a rule (activity/declarative...). | @baseclass | pyTestCase, RuleRef |

## 10. Utilities, Functions & Libraries (Tiện ích & Hàm)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `RULE-ALIAS-FUNCTION` | Alias Function: SQL/function alias exposed to the engine. | @baseclass | pyFunction, pyLibrary |
| `RULE-UTILITY-FUNCTION` | Utility Function: reusable Java function callable from expressions/activities. | @baseclass / library | pyFunction, Library, Params |
| `RULE-UTILITY-LIBRARY` | Utility Library: groups Java functions for a namespace. | @baseclass | pyLibrary, Functions |
| `Rule-Alias-Function` | Alias Function: SQL/function alias exposed to the engine. | @baseclass | pyFunction, pyLibrary |
| `Rule-Method` | Method: engine-invoked method definition. | @baseclass | pyMethod |
| `Rule-Utility-Function` | Utility Function: reusable Java function callable from expressions/activities. | @baseclass / library | pyFunction, Library, Params |
| `Rule-Utility-Library` | Utility Library: groups Java functions for a namespace. | @baseclass | pyLibrary, Functions |
| `Rule-Utility-Script` | Utility Script: server-side script (e.g. JS) utility. | @baseclass | pyScript |

## 11. Correspondence & Content (Thư tín & Nội dung)

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `RULE-FILE-BINARY` | Binary File: stores binary content (images/attachments). | @baseclass | pyFileName, pyContent |
| `RULE-FILE-TEXT` | Text File: stores text content. | @baseclass | pyFileName, pyContent |
| `RULE-OBJ-CORR` | Correspondence rule (alias). | Any class | pyCorrName |
| `Rule-Corr-Fragment` | Correspondence Fragment: reusable correspondence snippet. | Any class | pyFragment |
| `Rule-CorrType` | Defines the Corrtype rule. | Resolved by Rule-Resolve key (Applies-To class / RuleSet / Version). | pxObjClass, pyRuleName, pyDescription, RuleSet, Version |
| `Rule-File-Binary` | Binary File: stores binary content (images/attachments). | @baseclass | pyFileName, pyContent |
| `Rule-File-Eform` | EForm File: electronic form definition file. | @baseclass | pyForm |
| `Rule-File-Form` | Form File: form definition. | @baseclass | pyForm |
| `Rule-File-Text` | Text File: stores text content. | @baseclass | pyFileName, pyContent |
| `Rule-Obj-Corr` | Correspondence rule (alias). | Any class | pyCorrName |
| `Rule-Stream` | Stream: binary/stream content holder. | @baseclass | pyStream |
| `Rule-Template-Word` | Word Template: MS Word merge template. | Any class | pyTemplate |

## 12. Catalog Namespace Nodes (Non-rule placeholders)

> Các node dưới đây là **thư mục / namespace** trong catalog RAP (kết thúc bằng `-` hoặc là `@baseclass` / `pega-core-schemas`). Chúng KHÔNG phải là rule đơn lẻ mà là vùng chứa phân loại — được liệt kê ở đây để đảm bảo đủ 267 tên.

| Rule Type | Mục đích (Purpose) | Applies-To / Target | Key Fields |
|-----------|--------------------|---------------------|------------|
| `@baseclass` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Data-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Data-Admin-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Data-Admin-DB-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Access-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Access-Deny-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Access-Role-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Admin-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Agent-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Alias-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Async-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-AutoTest-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Circumstance-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Connect-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Corr-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Decision-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Declare-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Define-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Edit-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-File-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-HTML-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Map-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Obj-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Obj-Report-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Parse-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-PegaQ-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-RDB-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-RuleSet-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-SecurityVA-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Service-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Strategy-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Template-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Test-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-UI-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `Rule-Utility-` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |
| `pega-core-schemas` | Namespace / category container node in the RAP catalog (not an individual rule instance). | n/a | n/a |

## 3. Mô hình quan hệ & phụ thuộc (Relationship & Dependency Model)

### 3.1 Tổng quan phụ thuộc (narrative)

- **Application** (`RULE-APPLICATION`) tham chiếu các **RuleSet** (`RULE-RULESET-NAME` /
  `RULE-RULESET-VERSION`) và **Access Group** (`DATA-ADMIN-OPERATOR-ACCESSGROUP`) -> cấp quyền
  cho **Operator** (`DATA-ADMIN-OPERATOR-ID`).
- **Access Group** gán **Access Role** (`RULE-ACCESS-ROLE-NAME` / `RULE-ACCESS-ROLE-OBJ`) cấp
  **Privilege** (`RULE-ACCESS-PRIVILEGE`) và **Access Policy** (`RULE-ACCESS-POLICY`) bảo vệ rule/class.
- **Case Type** (`RULE-OBJ-CASETYPE`) tham chiếu **Stage** (`RULE-OBJ-STAGE`), **Flow**
  (`RULE-OBJ-FLOW`), **Data Model** (`RULE-OBJ-CLASS`/`RULE-OBJ-PROPERTY`), **SLA**
  (`RULE-OBJ-SERVICELEVEL`) và **View/Section** (`RULE-UI-VIEW`/`RULE-HTML-SECTION`).
- **Flow** (`RULE-OBJ-FLOW`) gọi **Activity** (`RULE-OBJ-ACTIVITY`), subprocess, assignment qua
  **Flow Action** (`RULE-OBJ-FLOWACTION`), và **Data Transform** (`RULE-OBJ-MODEL`).
- **Activity** (`RULE-OBJ-ACTIVITY`) gọi **Function** (`RULE-UTILITY-FUNCTION` / `RULE-ALIAS-FUNCTION`),
  **Connect/Service** rules, **Data Transform**, và các Activity khác; dùng **When** (`RULE-OBJ-WHEN`)
  và **Validate** (`RULE-OBJ-VALIDATE`) để rẽ nhánh/kiểm tra.
- **Section/Harness** (`RULE-HTML-SECTION` / `RULE-HTML-HARNESS`) bind tới **Property**
  (`RULE-OBJ-PROPERTY`) và **Control** (`RULE-HTML-PROPERTY`), được Flow Action sử dụng để hiển thị form.
- **Decisioning**: **Flow/Activity** gọi **Decision Table/Tree** (`RULE-DECLARE-*`), **When**, và
  **Declare Pages** (`RULE-DECLARE-PAGES`) / **Data Transform** cung cấp dữ liệu.
- **Integration**: **Connect** (`RULE-CONNECT-*`) / **Service** (`RULE-SERVICE-*`) rules dùng
  **Parse** (`RULE-PARSE-*`) / **Map** (`RULE-MAP-*`) và **Data Model** để chuyển đổi; xác thực qua
  **Auth Profile** (`RULE-CONNECT-AUTHPROFILE` / `DATA-ADMIN-SECURITY-AUTHENTICATIONPROFILE`).
- **Reporting**: **Report Definition** (`RULE-OBJ-REPORT-DEFINITION`) dựa trên **Class/Property**
  và **Association** (`RULE-OBJ-ASSOCIATION`) để join dữ liệu.

### 3.2 Ma trận phụ thuộc (Dependency Matrix)

| Rule Type | Thường phụ thuộc vào (depends on) | Thường được tham chiếu bởi (referenced by) |
|-----------|-----------------------------------|------------------------------------------|
| `RULE-APPLICATION` | RuleSet, AccessGroup | Operator / AccessGroup |
| `RULE-RULESET-NAME / VERSION` | (none - container) | Application, AccessGroup |
| `DATA-ADMIN-OPERATOR-ID` | AccessGroup | (runtime user) |
| `DATA-ADMIN-OPERATOR-ACCESSGROUP` | Application, AccessRole | Operator |
| `RULE-ACCESS-ROLE-NAME / OBJ` | Privilege, Policy | AccessGroup |
| `RULE-ACCESS-PRIVILEGE` | (none) | AccessRole, Rules |
| `RULE-OBJ-CASETYPE` | Flow, Stage, Class, SLA, View, ServiceLevel | Application, Case instances |
| `RULE-OBJ-FLOW` | Activity, FlowAction, Model, When, Subprocess | CaseType, FlowAction |
| `RULE-OBJ-ACTIVITY` | Function, Connect/Service, Model, When, Validate, Property | Flow, FlowAction, Declare-Trigger |
| `RULE-OBJ-MODEL (Data Transform)` | Property, Activity, Declare-Pages | Flow, FlowAction, Activity |
| `RULE-OBJ-FLOWACTION` | Section, Harness, Activity, Model | Flow, Portal/Case |
| `RULE-HTML-SECTION / HARNESS` | Property, Control(HTML-Property), FlowAction | FlowAction, Portal |
| `RULE-UI-VIEW` | Property, Section, Class | CaseType, Harness |
| `RULE-OBJ-CLASS / PROPERTY` | DB-Table, Association, FieldValue | Flow, Activity, Report, Section |
| `DATA-ADMIN-DB-TABLE / CLASSGROUP` | (DB) | Class |
| `RULE-DECLARE-DECISIONTABLE / TREE` | Property, When, Model | Flow, Activity, Strategy |
| `RULE-DECLARE-PAGES` | Data Transform, Connect/Service, Report | Activity, Section, Model |
| `RULE-OBJ-WHEN` | Property | Activity, Flow, Validate, Access-When |
| `RULE-CONNECT-* / SERVICE-*` | Parse, Map, AuthProfile, Model, Class | Activity, Service Package |
| `RULE-PARSE-* / MAP-*` | Class, Property | Connect, Service |
| `RULE-OBJ-REPORT-DEFINITION` | Class, Property, Association | Section, Portal, Schedule |
| `RULE-UTILITY-FUNCTION / LIBRARY` | (Java) | Activity, Expressions, When |
| `RULE-TEST-SUITE / UNIT-CASE` | Activity, Declarative, Flow | (CI / quality gate) |
| `RULE-ADMIN-PRODUCT (RAP)` | RuleSetVersion, App | Deployment / migration |

## 4. Gợi ý sơ đồ (Diagram Suggestion)

Một sơ đồ draw.io (tránh Mermaid theo quy ước dự án) nên vẽ theo các lớp:

```
OPERATOR --AccessGroup--> APPLICATION --RuleSet--> [RULES]
        |                      |
        v                      v
   ACCESS-ROLE ---------- PRIVILEGE/POLICY

CASETYPE --> STAGE --> FLOW --> ACTIVITY --> (FUNCTION / CONNECT / MODEL)
                |            |--> FLOWACTION --> SECTION/HARNESS --> PROPERTY
                |--> CLASS/PROPERTY --> DB-TABLE
                |--> DECISION (DecisionTable/When/Declare-Pages)
                |--> REPORT-DEFINITION
```

> Lưu ý: graph KB Pega trong repo hiện chưa có edge (KB-02 pending) nên mối quan hệ trên
> được suy luận từ cấu trúc rule-type và domain knowledge, không phải từ graph.
