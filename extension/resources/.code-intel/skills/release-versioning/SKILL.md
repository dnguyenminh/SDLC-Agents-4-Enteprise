---
name: release-versioning
description: Git release process — merge, version bump, tagging, README update
---

## Git Release Process (MANDATORY after successful deployment)

### Rules
- Each implemented ticket = 1 branch (branch name = `{TICKET}`)
- Each merge to master = 1 version bump + git tag
- Do NOT merge if sanity test hasn't passed
- Do NOT tag on branch — only tag on master after merge

### Steps
1. **Merge branch into master:**
   ```bash
   git checkout master && git pull origin master
   git merge {TICKET} --no-ff -m "Merge {TICKET}: {summary}"
   git push origin master
   ```

2. **Bump version (semver):**
   - MAJOR: Breaking changes
   - MINOR: New feature (default per ticket)
   - PATCH: Bug fix, hotfix
   ```bash
   git tag -a v{VERSION} -m "{TICKET}: {summary}"
   git push origin v{VERSION}
   ```

3. **Update README.md:**
   - Add entry to `## Changelog` section
   ```markdown
   ### v{VERSION} — {YYYY-MM-DD}
   - **{TICKET}**: {summary of changes}
   ```
   ```bash
   git add README.md && git commit -m "docs: update changelog for v{VERSION}"
   git push origin master
   ```

4. **Cleanup branch:**
   ```bash
   git branch -d {TICKET}
   git push origin --delete {TICKET}
   ```
