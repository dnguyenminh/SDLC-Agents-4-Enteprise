---
inclusion: manual
description: Code Intelligence system reference. Activate when working with .analysis/code-intelligence/ scripts.
---

# Code Intelligence System — Agent Instructions

> **Note**: This steering file will be fully written in Phase 11 of the implementation plan.
> For now, it serves as a placeholder. The TypeScript scripts under `.analysis/code-intelligence/scripts/` contain all core logic.

## Quick Reference

- **Scripts location**: `.analysis/code-intelligence/scripts/src/`
- **Config file**: `.analysis/code-intelligence/index-config.json`
- **Metadata file**: `.analysis/code-intelligence/index-metadata.json`
- **Analysis files**: `.analysis/code-intelligence/project-structure.md`, `.analysis/code-intelligence/modules/*.md`
- **Database schema**: `.analysis/code-intelligence/database-schema.md`

## Logging Format

```
[Code-Index] ERROR: {error-type} — {file-path} — {error-message}
[Code-Index] WARN: {warning-type} — {context} — {message}
[Code-Index] INFO: {action} — {details}
```
