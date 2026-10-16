# CI/CD Setup Check — SA4E-364

**Ticket:** SA4E-364 (Bug/High — wire MCP bridge tools into chat agent in extension)
**Scope:** `extension/src` only — `mcp-bridge-extension.ts`, `pi-workflow-adapter.ts`, `pi-agent-session-host.ts` (+ tests)
**Date:** 2026-10-16
**Verdict:** ✅ **N/A — no CI/CD changes required**

---

## 1. CI/CD Configuration Review

| Item | Result |
|------|--------|
| `.github/workflows/*.yml` | ❌ Not found — repo has no GitHub Actions pipeline |
| `.gitlab-ci.yml` / `Jenkinsfile` / `azure-pipelines.yml` / `.circleci/config.yml` | ❌ Not found — no CI server config in repo |
| CI execution model | Local/manual via npm scripts (no hosted pipeline exists to modify) |
| `extension/package.json` | version **1.53.1** — scripts reviewed in §3 |
| `extension/vitest.config.ts` | Unit suite: `src/**/__tests__/**/*.test.ts`; coverage gate scoped to PathResolver.ts + OriginGate.ts (≥95% per-file) — NOT touched by SA4E-364 |
| `extension/vitest.e2e.config.ts` | Only 2 files (cross-process, drawio-convert) — unaffected |
| `.kiro/settings/mcp.json` | Reference only: code-intelligence MCP (httpStream, 127.0.0.1:9183). No CI dependency |

## 2. Verdict — N/A

1. SA4E-364 is a scoped bug fix in `extension/src` + its `__tests__`: **no new service, no new build step, no new env/secret, no infra change**.
2. The repo has **no pipeline config file** — nothing exists to update. Tests already run via the extension's npm scripts (§3).
3. New/updated tests under the existing `src/**/__tests__/**/*.test.ts` include pattern are picked up automatically by `npm test` — **zero config change**.
4. Coverage thresholds gate only PathResolver.ts / OriginGate.ts; SA4E-364 files are outside the gate — no threshold edit needed.

## 3. Build + Test Commands (for DEV & QA)

All commands run from `extension/`:

| Purpose | Command | Notes |
|---------|---------|-------|
| Install deps | `npm ci` | Uses pinned package-lock.json |
| Unit tests | `npm test` | = `vitest run`. Runs TS source directly (esbuild transform) — **no prebuild required** |
| Coverage | `npm run test:coverage` | Threshold gate only for PathResolver/OriginGate |
| E2E (2 heavy files) | `npm run test:e2e` | Forks backend processes; slow; optional for this fix |
| Type-check / build | `npm run build` | = `tsc -p ./` |
| Lint | `npm run lint` | eslint on `src/` |
| Package VSIX (debug) | `npm run package:debug` | esbuild + vsce, for manual install |
| Package VSIX (prod) | `npm run package:prod` | incl. resource copy + checksums |

Minimal acceptance loop for SA4E-364:

```powershell
cd extension
npm ci
npm test          # unit + pi-workflow suite (incl. adapter "e2e-in-unit" file)
npm run build     # type check
npm run lint
```

**Note:** `src/pi-workflow/__tests__/pi-workflow-adapter.e2e.test.ts` is named "e2e" but is NOT excluded from the unit config → it runs inside `npm test` (uses the vscode mock alias, no real VS Code host).

### Existing tests covering SA4E-364 target files

- `src/pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts`
- `src/pi-workflow/__tests__/pi-workflow-adapter.e2e.test.ts`
- `src/pi-workflow/__tests__/pi-agent-session-host.test.ts`
- `src/pi-workflow/__tests__/pi-agent-session-host.auto-chunk.test.ts`

## 4. Version / Tag Status

- Latest tags (`git tag --sort=-v:refname | head -3`): **v1.53.1**, v1.53.0, v1.52.0
- `extension/package.json` version: **1.53.1** — in sync with latest tag
- HEAD: `5194d8d` — "SA4E-363: raise MCP wrapper body cap 1MB->64MB..."
- SA4E-364 is a bug fix → next release tag should be a **PATCH bump: v1.53.2** (per release-versioning rules; MINOR only for features)

## 5. Constraints Honored

- ❌ No CI/CD config modified · ❌ No deploy · ❌ No branch/tag created
- ❌ No files touched outside `documents/SA4E-364/`
