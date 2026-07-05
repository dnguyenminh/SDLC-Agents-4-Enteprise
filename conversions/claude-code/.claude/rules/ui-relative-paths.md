---
paths: "**/*.html,**/*.js"
---

# UI Relative Paths — NO ABSOLUTE PATHS

App may be deployed under sub-path. All URLs MUST use `basePath` helper.

## NEVER: absolute paths
```javascript
window.location.href = '/static/login.html';
fetch('/api/auth/login');
```

## ALWAYS: relative via basePath
```javascript
const basePath = window.__MCP_BASE || '';
window.location.href = basePath + '/static/login.html';
fetch(basePath + '/api/auth/login');
```

## Rules
| Type | Pattern |
|------|---------|
| Page redirect | `basePath + '/path'` |
| API fetch | `basePath + '/api/...'` |
| Static resource | Relative path |
| WebSocket | `ws://${location.host}${basePath}/ws` |

## Pre-commit — MUST NOT contain:
`href="/` `fetch('/` `location = '/` `src="/` `action="/`
