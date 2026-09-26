# Software Test Plan (STP) — SA4E-301

## Prefer Local Pega Rule on Checksum Match

### Document Information

| Field | Value |
|-------|-------|
| **Jira Ticket** | SA4E-301 |
| **Feature** | `kiroSdlc.pega.preferLocalOnChecksumMatch` |
| **Document Type** | Software Test Plan |
| **Author** | QA Agent |
| **Version** | 1.0 |
| **Date** | 2026-09-22 |
| **Status** | Draft — Phase 4 QA gate verified |

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-22 | QA Agent | Phase 4 quality-gate correction: complete six-level strategy, full RTM, test-data alignment, and diagram coverage. |

### Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | QA Agent | Pending | Pending |
| Scrum Master | SM Agent | Pending | Pending |

---

## 1. Introduction

### 1.1 Purpose

This plan defines how SA4E-301 is verified across property, unit, integration, API end-to-end, CLI end-to-end, and manual system-integration levels. The feature serves a local Pega rule file only when its three-field SHA-256 checksum matches the authoritative catalog checksum; otherwise it downloads from Pega. The invariant is:

`sha256(trim(pzInsKey) + "|" + trim(pxUpdateDateTime) + "|" + trim(pxSaveDateTime))`, lowercase hex.

### 1.2 Test Objectives

- Prove checksum determinism, exact three-field composition, trimming, lowercase output, and field-order sensitivity.
- Verify configuration declaration, defaults, reset, next-run effect, invalid values, and configuration-read failure handling.
- Verify local-hit, missing-file, mismatch, corrupt JSON, missing-field, permission-error, manifest, and sanitization paths.
- Verify remote fallback, retry, timeout, circuit-breaker, resilient/non-resilient, and HTTP error behavior.
- Verify backend ingest success, duplicate skip, validation failures, database failure, and `content_hash` invariant.
- Verify telemetry, structured logging, quantified performance/memory targets, database schema/indexes, and credential redaction.
- Achieve 100% design traceability for BRD acceptance criteria, FSD use cases/flows/rules, and TDD API/NFR/data requirements.

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | `documents/SA4E-301/BRD.md` |
| FSD | `documents/SA4E-301/FSD.md` |
| TDD | `documents/SA4E-301/TDD.md` |
| STC | `documents/SA4E-301/STC.md` |
| Test data | `documents/SA4E-301/testdata/` |

### 1.4 Scope

**In scope:** all five FSD use cases and their main/alternative/exception flows; BR-1 through BR-8; 25 numbered BRD story acceptance criteria plus the Story 6 disabled-setting requirement; three FSD/TDD API contracts; five quantified NFRs; five FSD error codes; TDD database, security, logging, timeout, retry, and circuit-breaker requirements.

**Out of scope:** production Pega behavior, changes to the checksum formula, bulk-check algorithm changes, non-Pega indexers, deprecated `PegaProjectIndexer`, and production credential validation. These boundaries match the BRD/FSD/TDD.

### 1.5 E2E-UI / E2E-CLI Terminology

This is a VS Code/Kiro extension with no browser-rendered feature page. Browser E2E-UI is N/A. The project terminology uses the registered `kiroSdlc.indexWorkspace` command, so command-level Playwright/CLI automation is classified as **E2E-CLI**. Only real-IDE visual, timing, and external-Pega exploratory checks remain manual SIT.
