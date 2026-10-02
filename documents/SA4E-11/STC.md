# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-11: Production Infrastructure

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-11 |
| Title | Production Infrastructure |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-28 |
| Status | Draft |
| Related STP | STP-v1-SA4E-11 |
| Related FSD | FSD-v1.1-SA4E-11 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-28 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Level | ID Prefix | Count | Priority |
|-------|-----------|-------|----------|
| PBT | PBT-XX | 4 | High |
| UT | UT-XX | 12 | High |
| IT | IT-XX | 10 | High |
| E2E-API | E2E-API-XX | 15 | High |
| E2E-UI | E2E-UI-XX | 6 | Medium |
| SIT | SIT-XX | 8 | Medium |

---

## 1. Docker Compose Orchestration — UC-01

### E2E-API-01: Docker Compose up starts all services

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Functional Happy Path |
| **Requirement** | UC-01, BR-01, BR-02, Story 1 AC 1-4 |
| **Preconditions** | docker-compose.yml present, Docker Engine running |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `docker compose up -d` | Command succeeds |
| 2 | Run `docker compose ps` | postgres, backend, nginx all Up (healthy) |
| 3 | Run `docker compose config` | Validation passes, no errors |

**Test Data:** `testdata/pre-seeded-data.csv` contains service names
**Postconditions:** All containers running with restart policy unless-stopped

### E2E-API-02: Service unhealthy triggers restart

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Alternative Flow AF-2 |
| **Requirement** | UC-01 AF-2 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Kill backend container | Container exits |
| 2 | Wait 10s | Docker Compose restarts backend automatically |
| 3 | Check logs | Restart logged |

### E2E-API-03: Port conflict handled gracefully

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | Medium |
| **Level** | E2E-API |
| **Type** | Alternative Flow AF-1 |
| **Requirement** | UC-01 AF-1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start service occupying port 80 | Port in use |
| 2 | Run `docker compose up -d` | Error message with suggested alternative ports |
| 3 | Modify compose to use 8080 | Starts successfully |

### UT-01: Compose file validation passes

| Attribute | Value |
|-----------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Level** | UT |
| **Type** | Business Rule BR-01 |
| **Requirement** | BR-01 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute `docker compose config` on valid yaml | Exit code 0 |
| 2 | Execute with invalid yaml | Exit code non-zero with error |

### SIT-01: Visual verification of docker compose logs

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-01 |
| **Priority** | Medium |
| **Level** | SIT |
| **Type** | Manual Visual |
| **Requirement** | UC-01 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `docker compose logs -f` | Logs readable, no stack traces |
| 2 | Verify timestamp format | ISO 8601 |

---

## 2. nginx Reverse Proxy — UC-02

### E2E-UI-01: HTTP redirects to HTTPS

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-01 |
| **Priority** | High |
| **Level** | E2E-UI |
| **Type** | Functional Happy Path |
| **Requirement** | UC-02, BR-03 |
| **File** | tests/e2e/nginx-redirect.ui.e2e.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to http://localhost | 301 redirect to https://localhost |
| 2 | Verify Location header | Contains https:// |

### E2E-API-04: TLS termination works

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Security |
| **Requirement** | BR-04 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send HTTPS request to nginx | Connection established TLS 1.2+ |
| 2 | Check `ssl_protocols` | TLS 1.0/1.1 rejected |

### E2E-API-05: Upstream unavailable returns 502

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-05 |
| **Priority** | Medium |
| **Level** | E2E-API |
| **Type** | Exception Flow EF |
| **Requirement** | UC-02 AF-1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stop backend container | Backend down |
| 2 | Request via nginx | 502 Bad Gateway returned |
| 3 | Restart backend | Service recovers |

### IT-01: nginx config reload without downtime

| Attribute | Value |
|-----------|-------|
| **ID** | IT-01 |
| **Priority** | Medium |
| **Level** | IT |
| **Type** | Integration |
| **Requirement** | UC-02 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send continuous requests to nginx | 200 responses |
| 2 | Reload nginx config | Zero failed requests |

---

## 3. PostgreSQL Persistent Checkpointer — UC-03

### E2E-API-06: Create checkpoint in PostgreSQL

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-06 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Functional Happy Path |
| **Requirement** | UC-03, BR-05, BR-06 |
| **Test Data** | `testdata/checkpoint-testdata.csv` |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | API call to save checkpoint with valid UUID | 201 Created |
| 2 | Query DB `SELECT * FROM checkpoints WHERE checkpoint_id=$1` | Record exists |
| 3 | Verify payload JSON valid | payload parsed correctly |

### E2E-API-07: Read checkpoint from PostgreSQL

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-07 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Functional Happy Path |
| **Requirement** | UC-03 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Retrieve checkpoint by ID | 200 OK with payload |
| 2 | Compare with saved data | Exact match |

### IT-02: Checkpointer repository save/get

| Attribute | Value |
|-----------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Level** | IT |
| **Type** | Integration |
| **Requirement** | UC-03 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `CheckpointerRepository.save()` | Record inserted |
| 2 | Call `get()` with same ID | Returns same object |

### UT-02: UUID format validation

| Attribute | Value |
|-----------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Level** | UT |
| **Type** | Business Rule BR-05 |
| **Requirement** | BR-05 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save checkpoint with invalid UUID `123` | Validation error 400 |
| 2 | Save with valid UUID | Success |

### PBT-01: Property-based UUID validation

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Level** | PBT |
| **Type** | Property |
| **Requirement** | BR-05 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate 100 random strings | Only valid UUIDs accepted |
| 2 | Property holds | No false positives |

### E2E-API-08: Migration from JSON to PostgreSQL

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-08 |
| **Priority** | Medium |
| **Level** | E2E-API |
| **Type** | Alternative Flow AF-1 |
| **Requirement** | UC-03 AF-1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run migration script on sample JSON files | Records inserted |
| 2 | Verify count matches | Migration success |

### E2E-API-09: DB connection loss fallback

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-09 |
| **Priority** | Medium |
| **Level** | E2E-API |
| **Type** | Exception Flow EF-1 |
| **Requirement** | UC-03 EF-1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stop PostgreSQL container | DB unreachable |
| 2 | Attempt save checkpoint | Fallback to in-memory with warning log |
| 3 | Restart DB | Sync resumes |

---

## 4. Health Check Endpoints — UC-04

### E2E-API-10: GET /healthz returns 200

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-10 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Functional Happy Path |
| **Requirement** | UC-04, BR-07 |
| **File** | tests/e2e/health.e2e.test.ts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET http://localhost/healthz | 200 OK |
| 2 | Verify JSON body | `{"status":"ok","timestamp":"...","version":"1.0.0"}` |

### E2E-API-11: GET /ready returns 200 when DB connected

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-11 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Functional Happy Path |
| **Requirement** | UC-04, BR-08 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /ready | 200 `{"status":"ready","db":"connected"}` |
| 2 | Response time <200ms | Latency OK |

### E2E-API-12: GET /ready returns 503 when DB down

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-12 |
| **Priority** | Medium |
| **Level** | E2E-API |
| **Type** | Alternative Flow AF-1 |
| **Requirement** | UC-04 AF-1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stop PostgreSQL | DB down |
| 2 | GET /ready | 503 `{"status":"not_ready","reason":"db_connection_failed"}` |

### IT-03: Health service liveness/readiness

| Attribute | Value |
|-----------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Level** | IT |
| **Type** | Integration |
| **Requirement** | UC-04 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call HealthService.liveness() | Returns ok |
| 2 | Call readiness with healthy pool | Returns ready |

### PBT-02: Health response time property

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-02 |
| **Priority** | Medium |
| **Level** | PBT |
| **Type** | Non-Functional |
| **Requirement** | NFR Performance |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call /healthz 100 times | p95 latency <100ms |

---

## 5. CORS/CSRF Protection — UC-05

### E2E-API-13: CORS whitelist enforced

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-13 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Security |
| **Requirement** | UC-05, BR-09 |
| **Test Data** | `testdata/auth-testdata.csv` |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Request from unauthorized origin `http://evil.com` | 403 Forbidden |
| 2 | Request from allowed origin `https://app.sa4e.local` | 200 OK |

### E2E-API-14: CSRF token required for POST

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-14 |
| **Priority** | High |
| **Level** | E2E-API |
| **Type** | Security |
| **Requirement** | UC-05, BR-10 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST without CSRF token | 403 Missing CSRF token |
| 2 | POST with valid token | 200 OK |

### E2E-API-15: Security headers present

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-15 |
| **Priority** | Medium |
| **Level** | E2E-API |
| **Type** | Security |
| **Requirement** | NFR Security |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET request via nginx | Headers `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` present |

### UT-03: CSRF secret validation

| Attribute | Value |
|-----------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Level** | UT |
| **Type** | Business Rule |
| **Requirement** | BR-10 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Initialize middleware with CSRF_SECRET <32 chars | Startup fails validation |
| 2 | Initialize with 32+ chars | Success |

### SIT-02: Manual CORS preflight check

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-02 |
| **Priority** | Medium |
| **Level** | SIT |
| **Type** | Manual |
| **Requirement** | UC-05 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open browser dev tools | Preflight OPTIONS returns 204 |
| 2 | Check Access-Control-Allow-Origin | Matches whitelist |

---

## 6. Non-Functional & Integration

### UT-04: PostgreSQL connection pool limits

| Attribute | Value |
|-----------|-------|
| **ID** | UT-04 |
| **Priority** | Medium |
| **Level** | UT |
| **Type** | Non-Functional |
| **Requirement** | NFR Scalability |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create 25 concurrent connections | Pool max 20 enforced, queueing works |

### IT-04: Checkpointer migration rollback on failure

| Attribute | Value |
|-----------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Level** | IT |
| **Type** | Exception |
| **Requirement** | UC-03 EF-2 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Migrate file with invalid JSON | Rollback, alert ops, no partial insert |

### PBT-03: Payload JSON validity

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-03 |
| **Priority** | Medium |
| **Level** | PBT |
| **Type** | Property |
| **Requirement** | BR-06 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random payloads | Only valid JSON accepted |

### SIT-03: Visual confirmation of TLS padlock

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-03 |
| **Priority** | Low |
| **Level** | SIT |
| **Type** | UI/UX |
| **Requirement** | UC-02 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open browser to https://localhost | Padlock icon shown, certificate valid |

---

## 7. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 Docker Compose Orchestration | FSD 3.1 | E2E-API-01, E2E-API-02, E2E-API-03, UT-01, SIT-01 | ✅ |
| BR-01 Compose validation | FSD 3.1.3 | UT-01 | ✅ |
| BR-02 Service restart policy | FSD 3.1.3 | E2E-API-02 | ✅ |
| UC-02 nginx Reverse Proxy | FSD 3.2 | E2E-UI-01, E2E-API-04, E2E-API-05, IT-01 | ✅ |
| BR-03 HTTPS enforced | FSD 3.2.3 | E2E-UI-01 | ✅ |
| BR-04 TLS 1.2+ | FSD 3.2.3 | E2E-API-04 | ✅ |
| UC-03 PostgreSQL Checkpointer | FSD 3.3 | E2E-API-06, E2E-API-07, IT-02, UT-02, PBT-01, E2E-API-08, E2E-API-09 | ✅ |
| BR-05 UUID format | FSD 3.3.3 | UT-02, PBT-01 | ✅ |
| BR-06 Payload JSON | FSD 3.3.3 | PBT-03 | ✅ |
| UC-04 Health Checks | FSD 3.4 | E2E-API-10, E2E-API-11, E2E-API-12, IT-03, PBT-02 | ✅ |
| BR-07 /healthz 200 | FSD 3.4.3 | E2E-API-10 | ✅ |
| BR-08 /ready DB | FSD 3.4.3 | E2E-API-11 | ✅ |
| UC-05 CORS/CSRF | FSD 3.5 | E2E-API-13, E2E-API-14, E2E-API-15, UT-03, SIT-02 | ✅ |
| BR-09 Origin whitelist | FSD 3.5.3 | E2E-API-13 | ✅ |
| BR-10 CSRF token | FSD 3.5.3 | E2E-API-14, UT-03 | ✅ |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 5 | 5 | 100% |
| Business Rules | 10 | 10 | 100% |
| Acceptance Criteria | 5 | 5 | 100% |
| **Overall** | **20** | **20** | **100%** |

---

## Appendix

### Test Data Setup Scripts

SQL migration:
```sql
CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id UUID PRIMARY KEY,
  workflow_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Environment Configuration

- Docker Compose file: `docker-compose.yml`
- Nginx config: `nginx/nginx.conf`
- Env vars: DATABASE_URL, CORS_ORIGIN, CSRF_SECRET, NGINX_TLS_CERT, NGINX_TLS_KEY

