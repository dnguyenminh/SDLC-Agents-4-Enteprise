---
applyTo: "**/*.html,**/*.js"
---

# UI Relative Paths — NO ABSOLUTE PATHS

All URLs MUST use `basePath` helper (app may be under sub-path).

## NEVER: `href="/..."` `fetch('/...')` `src="/..."`
## ALWAYS: `basePath + '/path'` or relative paths

```javascript
const basePath = window.__MCP_BASE || '';
fetch(basePath + '/api/auth/login');
```
