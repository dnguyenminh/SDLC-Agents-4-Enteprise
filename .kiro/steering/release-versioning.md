---
inclusion: manual
description: Release versioning rules. Activate khi tạo release tag, bump versions, hoặc publish modules.
---

# Release & Versioning Rules

## ⛔ Quy tắc bắt buộc khi tạo release tag

### Trước khi tạo tag, PHẢI bump version tất cả publishable modules:

| Module | File | Registry |
|--------|------|----------|
| Node.js Bridge | `mcp-client-bridge/package.json` → `"version"` | npm |
| Python Bridge | `mcp-bridge-python/pyproject.toml` → `version` | PyPI |
| Kotlin Server | `build.gradle.kts` → `version` | GitHub Release |

### Quy trình release (DevOps + SM):

1. **Bump versions** — tất cả modules phải có version mới (npm/PyPI reject duplicate)
2. **Run tests locally** — `npm test` (bridge), `gradlew test` (server)
3. **Commit version bumps** — `chore: bump versions to X.Y.Z for release`
4. **Create tag** — `git tag vX.Y.Z -m "description"`
5. **Push** — `git push origin master --tags`
6. **Monitor CI** — `gh run watch` — nếu fail, fix ngay

### Version format:

- Major release: `v1.2.0` → bump all modules to match (e.g., `1.2.0`)
- Patch release: `v1.2.1` → bump modules that changed (e.g., `1.0.0` → `1.0.1`)
- Modules version KHÔNG cần match project version, chỉ cần > previous published

### ⛔ KHÔNG BAO GIỜ:

- Tạo tag mà không bump module versions
- Push tag khi tests chưa pass locally
- Delete + recreate tag quá 2 lần (nếu fail 2 lần → dừng, debug root cause)

### Khi CI fail:

1. `gh run view --log-failed` — xem lỗi
2. Fix locally, run tests
3. Commit fix
4. Delete old tag: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
5. Recreate: `git tag vX.Y.Z -m "..."` 
6. Push: `git push origin master --tags`
