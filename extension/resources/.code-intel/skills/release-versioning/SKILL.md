---
name: release-versioning
description: Release versioning rules — bump publishable module versions before tagging, run tests, create tag
---

## Mandatory Rule When Creating a Release Tag

Before creating a tag, MUST bump the version of ALL publishable modules:

| Module | File | Registry |
|--------|------|----------|
| Extension | `extension/package.json` → `"version"` | VS Code Marketplace |
| Backend | `backend/package.json` → `"version"` | npm |
| Python Services | `backend/servers/fastapi/pyproject.toml` → `version` | PyPI |

## Release Process (DevOps + SM)

1. **Bump versions** — all modules must have a new version (npm/PyPI reject duplicates)
2. **Run tests locally** — `npm test` (backend + extension) using Vitest
3. **Commit version bumps** — `chore: bump versions to X.Y.Z for release`
4. **Create tag** — `git tag vX.Y.Z -m "description"`
5. **Push** — `git push origin master --tags`
6. **Monitor CI** — `gh run watch` — if failing, fix immediately

## Version Format

- Major release: `v1.2.0` → bump all modules to match (e.g., `1.2.0`)
- Patch release: `v1.2.1` → bump only the modules that changed (e.g., `1.0.0` → `1.0.1`)
- Module versions do NOT need to match the project version, only need to be > previous published version

## NEVER

- Create a tag without bumping module versions
- Push a tag while tests have not passed locally
- Delete + recreate a tag more than 2 times (fail twice → stop, debug the root cause)

## When CI Fails

1. `gh run view --log-failed` — inspect the error
2. Fix locally, run tests
3. Commit the fix
4. Delete old tag: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
5. Recreate: `git tag vX.Y.Z -m "..."`
6. Push: `git push origin master --tags`