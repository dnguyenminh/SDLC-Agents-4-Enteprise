# Release v1.55.10

## Summary
CI supply-chain hardening (undici/zod/body-parser CVEs) and consolidation of the
8 per-ticket workflows into a single `ci.yml`.

## Changes Included

### 🔒 Security / Supply-chain
- **undici** lifted to patched lines across the whole dependency tree: 6.29.1 / 7.30.1 / 8.12.3 (clears GHSA-4qv8-2p9j-2685 EventSource DoS + TLS/SRI/redirect advisories)
- **zod** 4.x → 4.6.7, **body-parser** → 2.4.0 (in-range via `npm update`)
- Backend image: bundled-npm `undici` 6.28.1 → 6.29.1 — **Trivy gate green**
- **Vendor-patch extended** (`scripts/patch-vendored-deps.mjs`): swaps every vulnerable nested `undici`, because npm `overrides` are ignored for `@earendil-works/pi-coding-agent`'s shrinkwrapped subtree
- **audit-gate** (`scripts/audit-gate.mjs`): fails on High/Critical EXCEPT one documented, un-fixable upstream advisory — `GHSA-mrhx-c7xc-m3w5` (zod `<4.6.6` via `puppeteer-core`/`chromium-bidi`, which pin `zod ^3.24.1`; runtime dep, no fixed 3.x line). Still blocks any NEW High/Critical finding. Re-review when upstream adopts zod ≥ 4.6.6.

### 🧹 CI consolidation
- Folded the shared gates of 8 per-ticket workflows into a single `ci.yml`:
  lint + typecheck + unit/integration/e2e-api/contract tests + supply-chain audit
  (backend + extension) + static gates (secret scan + line-count ≤ 200)
- Removed `ci-sa4e-191/223/241/332/336/356/358/369.yml` — the project now keeps exactly ONE CI workflow

### 🐛 Fixes
- `messageListener.ts`: quote `'tab:updated'` / `'tab:switch'` handler keys (eslint parse error surfaced by the new lint gate)
- Remove dead `TAB_UPDATED` message type (leftover from the pre-SA4E-370 convention; no sender emits it — `tab:updated` is the live protocol)

### 🏷️ Version & Tag
- Version: **1.55.10** (bumped from 1.55.9)
- Synced across root / `backend` / `extension` + lockfiles

### 📁 Modified Files
- `package.json` (root) — 1.55.10
- `backend/package.json`, `extension/package.json` — 1.55.10
- `.github/workflows/ci.yml` — new lint + supply-chain + static-gates jobs
- `scripts/patch-vendored-deps.mjs`, `scripts/audit-gate.mjs`, `scripts/vendor/undici-7.30.1/`, `scripts/vendor/undici-8.12.3/`
- `backend/Dockerfile` — undici 6.29.1
- `README.md`, `RELEASE_NOTE.md`, `extension/README.md` — version badge + changelog
