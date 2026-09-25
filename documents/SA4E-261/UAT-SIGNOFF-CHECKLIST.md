# UAT Sign-off Checklist — SA4E-261

## Ticket Information

- **Ticket:** SA4E-261
- **Title:** Indexer skips non-Java source files - index all supported source artifacts
- **Phase:** User Acceptance Testing
- **Current Phase:** uat
- **Test Report:** TEST-REPORT.md v1.0

---

## Acceptance Criteria from BRD

### AC 1: Unified Extension Whitelist
- [ ] Extension file discovery includes jsp, xml, sql, properties, yml, yaml, html, css
- [ ] Backend FALLBACK_EXTENSIONS matches extension list exactly
- [ ] Contract test guard passes

### AC 2: Tier B Full-Text Indexing
- [ ] JSP/XML/SQL/config files are indexed as Tier B
- [ ] Full-text search returns results for non-grammar files
- [ ] Search snippets displayed

### AC 3: Performance & Safety
- [ ] Indexing time increase <20% for sample project 97c72f0c2366
- [ ] API response p95 <500ms
- [ ] Path traversal blocked
- [ ] Unsupported extensions rejected with log

---

## UAT Test Scenarios

| # | Scenario | Steps | Expected Result | Status |
|---|----------|-------|-----------------|--------|
| 1 | Index JSP file | Trigger index on Spring Boot project with JSP views | JSP files searchable, Tier B | ☐ |
| 2 | Search XML config | Search for "spring-boot-starter" in pom.xml | Result includes pom.xml snippet | ☐ |
| 3 | Search SQL schema | Search for table name in schema.sql | Result includes schema.sql snippet | ☐ |
| 4 | Verify Java still works | Search Java symbol | Symbol found, Tier A | ☐ |
| 5 | Unwanted extension | Attempt to index .exe | Rejected, logged | ☐ |

---

## Sign-off

| Role | Name | Signature | Date | Comments |
|------|------|-----------|------|----------|
| Business Analyst | | ☐ Approved | | |
| Product Owner | | ☐ Approved | | |
| QA Lead | QA Agent | ✅ Verified | 2026-09-11 | All tests passed |
| Dev Lead | | ☐ Approved | | |

**Overall UAT Status:** ☐ PASS ☐ FAIL ☐ Pending

---

## Notes

- Testing completed 100% pass, 0 defects.
- Ready for business validation.
- Transition to deployment pending UAT approval.
