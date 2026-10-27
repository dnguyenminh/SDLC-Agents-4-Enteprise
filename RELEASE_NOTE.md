# Release v1.55.8

## Summary
Patch release pinning transitive dependencies to address security advisories.

## Changes Included

### 🔒 Security
- Root `overrides` now pin transitive dependencies:
  - `body-parser` → `2.4.0`
  - `undici` → `6.29.1`
  - (`esbuild` → `0.28.2` retained)

### 🏷️ Version & Tag
- Version: **1.55.8** (bumped from 1.55.7)
- Synced across root / `backend` / `extension`

### 📁 Modified Files
- `package.json` (root) - Added `body-parser` + `undici` overrides; version 1.55.8
- `backend/package.json` - Version 1.55.8
- `extension/package.json` - Version 1.55.8
- `README.md` - vsix install string + changelog v1.55.8
- `extension/README.md` - Badge + vsix install strings + changelog v1.55.8

---
*Release v1.55.8*
