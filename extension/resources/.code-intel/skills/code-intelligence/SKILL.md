---
name: code-intelligence
description: Code Intelligence system reference — scripts, config, metadata for code analysis
---

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