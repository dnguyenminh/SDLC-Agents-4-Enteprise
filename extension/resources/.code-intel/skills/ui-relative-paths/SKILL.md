---
name: ui-relative-paths
description: UI relative path rules — no absolute paths, use basePath helper for sub-path deployment
---

## Principle

Application may be deployed under a sub-path (e.g. `https://domain.com/mcp/`).
Every URL in HTML/JS **MUST** use relative paths via `basePath` helper.

## ABSOLUTELY FORBIDDEN

```javascript
// NEVER use absolute path
window.location.href = '/static/login.html';
fetch('/api/auth/login', { ... });
<script src="/static/nav-bar.js"></script>
<a href="/profile">Profile</a>
```

## MANDATORY

```javascript
// Use basePath helper
window.location.href = basePath + '/static/login.html';
fetch(basePath + '/api/auth/login', { ... });

// Or relative path for same directory
<script src="nav-bar.js"></script>
```

## How to Get basePath

Every HTML page MUST include `nav-bar.js` (which exports `window.__MCP_BASE`):

```javascript
// In nav-bar.js — auto-detect base path
const basePath = (function() {
    const base = document.querySelector('base');
    if (base) return base.getAttribute('href').replace(/\/$/, '');
    const script = document.querySelector('script[src*="nav-bar.js"]');
    if (script) return script.src.replace(/\/static\/nav-bar\.js.*$/, '');
    return '';
})();
window.__MCP_BASE = basePath;
```

In other pages:

```javascript
const basePath = window.__MCP_BASE || '';
```

## Rules by URL Type

| Type | Pattern | Example |
|------|---------|---------|
| **Page redirect** | `basePath + '/path'` | `window.location.href = basePath + '/login'` |
| **API fetch** | `basePath + '/api/...'` | `fetch(basePath + '/api/auth/login')` |
| **Static resource** | Relative path | `<script src="nav-bar.js">` |
| **Nav links** | `basePath + '/path'` | `{ href: basePath + '/profile' }` |
| **WebSocket** | Derive from `window.location` | `ws://${location.host}${basePath}/ws` |

## Rules for `<script>` and `<link>` Tags

- If HTML and resource are in **same directory** (`/static/`) → use relative: `src="nav-bar.js"`
- If different directories → use `basePath`: do not hardcode `/static/`

## Pre-Commit Check

Grep check — no occurrences of these patterns in HTML/JS:

```
href="/          ← absolute href
fetch('/         ← absolute fetch
location = '/   ← absolute redirect
location.href = '/
src="/           ← absolute script/img src
action="/        ← absolute form action
```

Only exception: `href="/"` redirect to homepage → must be `basePath + '/'`.