# Release v1.55.11

## Summary
Pega ingest resilience — harden the per-rule ingest client against
`UND_ERR_SOCKET "other side closed"`, hung backends, and a misconfigured
backend URL.

## Changes Included

### 🩹 Resilience fixes (extension — per-rule Pega ingest)
- **Socket closed mid-body** — `fetch()` resolves on headers, then throws while
  reading the body (undici `UND_ERR_SOCKET`). The body read is now defensive
  (`readEnvelope`): a dropped/truncated/empty body is re-tagged `TransientBodyError`
  and **retried** with backoff, instead of being skipped as a permanent parse error.
- **Explicit fetch timeout** — per-rule ingest uses `AbortSignal.timeout(30s)`,
  so a hung backend becomes a retryable `TimeoutError` instead of blocking a
  pipeline consumer forever.
- **Empty/malformed backend URL guard** — VS Code `get(key, default)` only
  substitutes the default when the key is *undefined*; an explicit `""` for
  `sdlcAgents.backend.url` used to yield a host-less URL and an opaque fetch
  failure. `PegaHttpCore.getBackendUrl()` now falls back to the default on
  empty/whitespace, and `resolveIngestEndpoint()` validates the URL and fails
  fast with a clear, **non-retryable** configuration message.

### 🔎 Diagnosability
- The ingest crash log now prints the **full target URL** (host:port + path),
  and each run logs its `🎯 Ingest target`, so a socket failure is traceable to
  the exact backend (loopback vs a misconfigured/remote `sdlcAgents.backend.url`).

### 🧱 Refactor + tests
- Per-rule ingest extracted from `PegaStreamIngester.ts` into
  `PegaStreamIngester/single-rule.ts` (both files back under the 200-line standard).
- New `PegaStreamIngester.resilience.test.ts` — 7 tests covering empty/malformed
  URL, socket-closed-mid-body retry, truncated-body retry, UND_ERR_SOCKET retry,
  retry exhaustion, and no-retry-on-permanent-rejection.

### 🏷️ Version & Tag
- Version: **1.55.11** (bumped from 1.55.10)
- Synced across root / `backend` / `extension` + lockfiles

### 📁 Modified Files
- `extension/src/services/pega/PegaHttpCore.ts` — empty-URL guard
- `extension/src/services/PegaStreamIngester.ts` — delegate to single-rule
- `extension/src/services/PegaStreamIngester/single-rule.ts` — NEW per-rule flow
- `extension/src/services/PegaStreamIngester/ingest-auth.ts` — `TransientBodyError`
- `extension/src/services/PegaStreamIngester/ingest-retry.ts` — retry TransientBodyError
- `extension/src/services/PegaBfsIndexer/ingest-log.ts` + `bfs-indexer.ts` — full-URL logging
- `extension/src/services/__tests__/PegaStreamIngester.resilience.test.ts` — NEW
- `README.md`, `RELEASE_NOTE.md`, `extension/README.md` — version + changelog
