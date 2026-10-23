# Deployment & Pipeline Guide — SA4E-370 (Custom Agents)

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-370 |
| Title | Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions) |
| Document Type | Deployment Guide — Phase 4.5 CI/CD Assessment |
| Version | 1.0 |
| Date | 2026-10-19 |
| Author | DevOps Agent |
| Status | Draft |
| Related TDD | documents/SA4E-370/TDD.md |
| Related FSD | documents/SA4E-370/FSD.md |
| Related STP | documents/SA4E-370/STP.md |

---

## 1. CI/CD Change Assessment — RESULT: NO CHANGES REQUIRED

### Assessment Summary

The SA4E-370 Custom Agents feature requires **no CI/CD pipeline changes**. All build, test, and deployment tooling already exists and is reused unchanged. The feature delivers code changes only within the existing VS Code extension; no new build steps, test suites, config files, dependencies, Docker images, or deployment targets are introduced.

### Rationale (per locked scope)

| Assessment Item | Result | Evidence /
|-----------------|--------|-----|
| New build steps | **No change** | `npm run compile` (TypeScript) already configured; feature modifies existing `.ts` files only | TDD §1.3, §10 |
| New test suites | **No change** | vitest already configured; new test files added under `extension/src/**/__tests__/` reuse existing framework | TDD §11 |
| New config files | **No change** | Zero-config NFR — no new config files/keys for local agent identity | TDD §10.1, §10.2 |
| New dependencies | **No change** | Reuses existing pi-dev extensions; `@vscode/vsce` already present | TDD §1.3 |
| New Docker / base image changes | **No change** | Feature runs in VS Code Extension Host; no containerization involved | TDD §2.3 |
| Deployment target changes | **No change** | VS Code Marketplace / OpenVSX — same pipeline (`vsce package` → `.vsix`) | TDD §2.3 |
| Database migrations | **No change** | Feature is in-memory only; no persistent database | TDD §4.1 |
| Environment-specific config | **No change** | Zero new env vars / config keys | TDD §10.1 |

---

## 2. Existing CI/CD Pipeline (unchanged)

The VS Code extension build pipeline for SA4E-370:

1. **`npm run compile`** — TypeScript compilation (existing)
2. **`npm test`** — vitest unit + integration tests (existing; new SA4E-370 test files added under `extension/src/**/__tests__/`)
3. **`vsce package`** — Package extension to `.vsix` using `@vscode/vsce` (existing)
4. **Publish** — VS Code Marketplace / OpenVSX (existing)

No pipeline stages are added, removed, or modified for this feature. See diagram: `diagrams/ci-cd-pipeline.drawio`

---

## 3. Deployment Considerations

- **Deployment target:** VS Code Extension Host (single process, in-process webview ↔ extension host)
- **Containerization:** None — no Docker, no microservices
- **Network sockets:** No new sockets introduced (TDD §1.5 Constraint)
- **Database migrations:** None — all data held in-memory within extension host process (TDD §4.1)
- **Rollback:** Revert source changes — see TDD §10.3 Rollback Strategy (registry key, context-compaction, selectAgent stub, fs-helpers parser). All changes are in-memory; no database migration to rollback.

---

## 4. Pre-Deployment Checklist

- [ ] Code merged to release branch
- [ ] All existing tests pass (vitest — regression suites green: `role-scope-wiring.test.ts`, `tool-loadout-roles.test.ts`, `context-governance.*`, auto-chunk, session routing)
- [ ] New SA4E-370 test files pass (TC-S1-01…TC-S4-03, custom-agents.e2e.test.ts)
- [ ] Extension compiles without errors (`npm run compile`)
- [ ] Extension packages successfully (`vsce package` → `.vsix`)
- [ ] No new dependencies introduced
- [ ] Rollback plan reviewed (TDD §10.3)

---

## 5. Post-Deployment Verification

| Check | Expected Result |
|-------|-----------------|
| Extension activation | Extension activates without error; agent parser loads, registry initializes |
| Agent discovery | `agentsLoaded` emitted with v2 AgentInfo list (role, phase, model, personaBody) |
| Agent switch | `AGENT_SWITCHED` emitted after successful wiring (persona + role/phase + loadout) |
| Per-tab isolation | Each tab maintains independent session; no history/token leak between tabs |

---

## 6. Environment-Specific Notes

| Environment | Notes |
|-------------|-------|
| Dev / Local | `npm run compile` + `npm test`; VS Code Extension Host launchable |
| CI | Same pipeline; no SA4E-370-specific steps; vitest + vsce package |
| SIT | VS Code Desktop (Stable/Insider) with packaged `.vsix` installed |
| PROD | VS Code Marketplace / OpenVSX publish (same pipeline, no feature-specific changes) |

---

## 7. Rollback Plan

If a post-deployment issue is detected:

1. Revert `registry.ts` key from `workspaceRoot+tabId` back to `workspaceRoot` only
2. Revert `context-compaction.ts` and `context-usage.ts` to `tabId="default"`
3. Revert `adapter-core.ts` `selectAgent` to stub (emit-only)
4. Revert `fs-helpers.ts` parser to v1 (frontmatter `name`+`description` only)
5. Revert `message-routing.ts` to restore `[Agent: X]` prefix mechanism
6. All changes are in-memory — no database migration to rollback
7. Verify: extension activates, `agentsLoaded` emits v1 AgentInfo, existing regression suites green

---

## 8. Conclusion

**No CI/CD changes required for SA4E-370.** The Custom Agents feature is delivered entirely through existing build (`npm run compile`), test (vitest), and packaging (`vsce package`) tooling. No pipeline configuration, Docker image, or deployment target modifications are needed.
