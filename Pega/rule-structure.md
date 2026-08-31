# Pega Rule-Type Structure & Rule ↔ Bộ phận (Component) Mapping

**App:** HRAppsV2 (Pega Infinity 25.1.3) · **Studio:** Dev Studio · **Operator:** SSA@TGB
**Mục tiêu:** Lập cấu trúc của mọi loại rule Pega và liên kết rule ↔ bộ phận (component = RuleSet + Applies-To class).

---

## 0. Phương pháp trích xuất rule (ĐÃ CHỨNG MINH)

Pega Dev Studio là SPA (URL không đổi khi mở rule) → không deep-link được. Cách duy nhất lấy XML rule qua automation:

1. Mở rule form (rule được load vào **Clipboard** dưới 1 page).
2. Mở **Clipboard** (link góc dưới phải).
3. **Right-click** node page trong cây Clipboard → menu DOM hiện: `Refresh Page | Delete Page | Show XML | Show JSON | Execute Activity`.
   - ⚠️ Dispatch `contextmenu` lên đúng node (element có text = tên page, `closest('li,div,[role=treeitem]')`), không phải link rỗng.
4. Click **Show XML** → Chromium mở XML view. Snapshot accessibility tree chứa **TOÀN BỘ** rule XML (element sâu đều có).
5. Lấy full XML: `eval "(new XMLSerializer().serializeToString(document.documentElement))"` không được (Chromium viewer wrapper) → dùng snapshot accessibility tree để parse.

**Ví dụ đã làm:** page `RH_1 (Rule-Obj-Model)` → Show XML → trích toàn bộ Model `TGB-FW-HR-DATA-SEATING!PYDEFAULT`.

> Ghi chú môi trường: Recents/Search clicks KHÔNG load rule form qua automation (chỉ search auto-navigate với kết quả duy nhất mới mở được, như pyDefault). Do đó rule phức tạp cần user mở thủ công trong browser → agent mới extract được qua Clipboard.

---

## 1. 16 nhóm Rule-Type (từ menu Create)

| # | Nhóm | Ví dụ rule-type bên trong |
|---|------|---------------------------|
| 1 | Application Definition | Application, Component, Built-on app |
| 2 | Data Model | Property, Model, Data Type, Data Transform, Report Definition |
| 3 | Decision | When, Decision Table, Decision Tree, Map Value, Decision Map |
| 4 | Generative AI | GenAI task, Prompt, Knowledge source |
| 5 | Integration-Connectors | Connect-SQL, Connect-SOAP, Connect-REST, Connect-HTTP, Connect-MQ, Connect-EJB, Connect-RuleML |
| 6 | Integration-Mapping | Data Transform (mapping), Mapping (siêu), Convert |
| 7 | Integration-Resources | Service REST/SOAP/HTTP/MQ/JMS, Service Package, Service Activity, XML Stream, JSON Stream |
| 8 | Integration-Services | Service, Service-REST, Service-SOAP, Service-HTTP, Service File |
| 9 | Organization | Operator ID, Work Group, Work Basket, Division, Unit, Access Group |
| 10 | Process | Flow, Flow Action, Stage, Step, SLA, Approval |
| 11 | Reports | Report Definition, Report Browser |
| 12 | Security | Access Role, Privilege, Access When, Authenticate, Security Policy |
| 13 | Survey | Question, Question Page, Survey |
| 14 | SysAdmin | Agent, Queue, Data-Agent, Dynamic System Setting, Email Account, Database |
| 15 | Technical | Activity, Function, Library, RuleSet, Rule-Declare-*, Class, Property |
| 16 | User Interface | Section, Harness, Flow Action, Skin, Portal, Control, Field Group |

---

## 2. Mô hình Rule ↔ Bộ phận (Component)

Mỗi rule instance được định danh bởi 3 thành tố → đây là "bộ phận":

```
pzInsKey = <RULE-TYPE> <APPLIES-TO CLASS> <RULE NAME> [#<timestamp>]
pyRuleSet  = <RuleSet>          ← bộ phận (component)
pyRuleSetVersion = <Major-Minor-Patch>   ← ví dụ 01-01-01
```

**Ví dụ thực tế (RH_1):**
- `pzInsKey` = `RULE-OBJ-MODEL TGB-FW-HR-DATA-SEATING PYDEFAULT #20250404T120424.988`
- `pyRuleSet` = `Employee` · `pyRuleSetVersion` = `01-01-01`
- `pyObjClassLabel` = `Data Transform` · `pxUpdateOperator` = `SSA@TGB`
- **→ Bộ phận:** Rule type = **Model** · Class = `TGB-FW-HR-Data-Seating` · RuleSet = **Employee** (component HRAppsV2).

---

## 3. Cấu trúc chi tiết từng Rule-Type

### 3.1 Data Transform (RULE-OBJ-DATATRANSFORM)
- **Tabs form:** Save as · Actions · View Definition · Parameters · Pages & Classes · Test cases · Specifications · History.
- **Actions (bước):** Set · Remove · Update Page · Apply Data Transform · Sort · Comment · When / Otherwise · Append to / Append and Map to · For Each Page In / Exit For Each · Exit Data Transform · equal to · Select values · Call superclass data transform.
- **Cấu trúc XML:** `pyProperties` (PageList ModelParams: `pyPropertyStepId`, `pyPropertiesName`, `pyActionName=SET`, `pyPropertiesValue`, `pyExpressionGadget` PegaGadget-ExpressionBuilder) · `pyPagesAndClasses` · `pxNamedPageReferences` · `pyParameters` · `pyStepPageReference`.

### 3.2 Model / Rule-Obj-Model (thực tế RH_1)
- `pyProperties` REPEATINGTYPE=PageList: mỗi dòng = 1 property (`pyPropertiesName`=.ID/.status/.office, `pyActionName`=SET, `pyPropertiesValue`="").
- Dùng làm parameter model / data shape của Data Transform & Case.

### 3.3 Flow (RULE-OBJ-FLOW) — *chưa extract được (cần user mở)*
- Cấu trúc: shapes (Assignment, Subprocess, Decision, Integrator, Utility, Start/End) + connectors (Always/When) + Pages & Classes.
- **Rule phức tạp đã phát hiện:** `CreateCandidateParty` (TGB-HRApps-Work-Candidate), `pyStartCase` (TGB-HRApps-Work-Onboarding), `InterviewCandidate_0` (TGB-HRApps-Work-Candidate), `RuleForm` (Harness của Rule-Obj-Flow).

### 3.4 Data Page (RULE-OBJ-DATAPAGE / D_*) — *chưa extract*
- Scope (Node/Requestor/Thread), Source (Report/Data Transform/Activity/Connector), Structure (Page/List).
- **Đã thấy:** `D_ServiceMethods`, `D_pzGetAllAccessGroups`, `D_SvcPkgsInAvailableCurrentApp`, `D_pzServicePackageInstance`, `D_pyListOfAccessGroups`, `Declare_LP_ApplicationData`.

### 3.5 Report Definition (RULE-OBJ-REPORT-DEFINITION) — *chưa extract*
- `pyReportDefinition` (filter, columns, sorting, grouping), `pyDataSources`.
- **Đã thấy:** `AccessGroupsByApplication`, `GetSvcPkgsInAvailableCurrentApp`, `pyAccessGroupsForCurrentApplication`, `pzAccessGroupsByApplication`.

### 3.6 Service Package / Service REST — *chưa extract*
- Service Package: `CodeIntelligence`, `ROBOTICSSSO`. Service REST: `GetDataPageList`, `GetRuleInstanceByHandle` (CodeIntelligence v1).
- Chứa Service Methods (D_ServiceMethods), XML/JSON Stream.

### 3.7 Access Group / Security — *chưa extract*
- `APPLICAT:ADMINISTRATORS` (Access Group). Liên kết Role → Privilege.

### 3.8 Case Type — *chưa extract*
- `Candidate`, `Onboarding` (Case Designer). Mỗi case có pyDefault (Data Transform khởi tạo) + Flow (pyStartCase).

---

## 4. Các rule phức tạp ĐÃ PHÁT HIỆN (để trích xuất tiếp)

| Loại | Tên | Applies-To / Class | Bộ phận (RuleSet) |
|------|-----|--------------------|-------------------|
| Flow | CreateCandidateParty | TGB-HRApps-Work-Candidate | HRAppsV2 |
| Flow | pyStartCase | TGB-HRApps-Work-Onboarding | HRAppsV2 |
| Flow | InterviewCandidate_0 | TGB-HRApps-Work-Candidate | HRAppsV2 |
| Data Page | D_ServiceMethods | Rule-Service-* | HRAppsV2 |
| Data Page | D_pzGetAllAccessGroups | Data-Admin-Operator-AccessGroup | HRAppsV2 |
| Report Def | AccessGroupsByApplication | Data-Admin-Operator-AccessGroup | HRAppsV2 |
| Service Pkg | CodeIntelligence | CODEINTELLIGENCE | HRAppsV2 |
| Access Group | APPLICAT:ADMINISTRATORS | APPLICAT | (Applicat) |

---

## 5. Hạn chế & Bước tiếp theo

- ❌ Automation không mở được rule tùy ý (Recents/Search click không load form; SPA không deep-link).
- ✅ Đã chứng minh trích xuất qua Clipboard → Show XML (RH_1 Model).
- ➡️ **Cần user:** mở 1-2 rule phức tạp (vd. Flow `CreateCandidateParty`, Data Page `D_ServiceMethods`) trong browser → agent right-click node Clipboard → Show XML → parse.
- Hoặc: export RAP của RuleSet **Employee** (HRAppsV2) để lấy XML mọi rule một lần (menu Export chưa tìm thấy qua automation — cần user thao tác hoặc chỉ đường).
