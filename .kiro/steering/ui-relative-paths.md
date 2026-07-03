---
inclusion: fileMatch
fileMatchPattern: "**/*.{html,js}"
---

# UI Relative Paths — KHÔNG DÙNG ABSOLUTE PATH

## Nguyên tắc

Ứng dụng có thể được deploy dưới sub-path (ví dụ `https://domain.com/mcp/`).
Mọi URL trong HTML/JS **PHẢI** dùng đường dẫn tương đối thông qua `basePath` helper.

## TUYỆT ĐỐI KHÔNG

```javascript
// ❌ KHÔNG BAO GIỜ dùng absolute path
window.location.href = '/static/login.html';
fetch('/api/auth/login', { ... });
<script src="/static/nav-bar.js"></script>
<a href="/profile">Profile</a>
```

## BẮT BUỘC

```javascript
// ✅ Dùng basePath helper
window.location.href = basePath + '/static/login.html';
fetch(basePath + '/api/auth/login', { ... });

// ✅ Hoặc relative path cho cùng thư mục
<script src="nav-bar.js"></script>
```

## Cách lấy basePath

Mọi HTML page PHẢI include `nav-bar.js` (đã export `window.__MCP_BASE`):

```javascript
// Trong nav-bar.js — detect base path tự động
const basePath = (function() {
    const base = document.querySelector('base');
    if (base) return base.getAttribute('href').replace(/\/$/, '');
    const script = document.querySelector('script[src*="nav-bar.js"]');
    if (script) return script.src.replace(/\/static\/nav-bar\.js.*$/, '');
    return '';
})();
window.__MCP_BASE = basePath;
```

Trong các page khác:

```javascript
const basePath = window.__MCP_BASE || '';
```

## Quy tắc cho từng loại URL

| Loại | Pattern | Ví dụ |
|------|---------|-------|
| **Page redirect** | `basePath + '/path'` | `window.location.href = basePath + '/login'` |
| **API fetch** | `basePath + '/api/...'` | `fetch(basePath + '/api/auth/login')` |
| **Static resource** | Relative path | `<script src="nav-bar.js">` |
| **Nav links** | `basePath + '/path'` | `{ href: basePath + '/profile' }` |
| **WebSocket** | Derive from `window.location` | `ws://${location.host}${basePath}/ws` |

## Quy tắc cho `<script>` và `<link>` tags

- Nếu HTML và resource **cùng thư mục** (`/static/`) → dùng relative: `src="nav-bar.js"`
- Nếu khác thư mục → dùng `basePath`: không hardcode `/static/`

## Kiểm tra trước khi commit

Grep check — không được có pattern sau trong HTML/JS:

```
href="/          ← absolute href
fetch('/         ← absolute fetch
location = '/   ← absolute redirect
location.href = '/
src="/           ← absolute script/img src
action="/        ← absolute form action
```

Ngoại lệ duy nhất: `href="/"` redirect về trang chủ → phải là `basePath + '/'`.
