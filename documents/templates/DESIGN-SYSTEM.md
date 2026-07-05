# Design System — MCP Orchestrator UI

## Overview

All UI pages in the MCP Orchestrator project share a unified design system with **dual-theme support**:

| Mode | Name | Description |
|------|------|-------------|
| **Light** | Navy/Crimson | Light backgrounds, navy accents, crimson highlights — tươi sáng, dễ đọc |
| **Dark** | GitHub Dark | Dark backgrounds, blue accents — low-strain for extended use |

Theme is toggled via `data-theme` attribute on `<html>` element. Default: **dark** (matches developer preference). User preference persisted in `localStorage`.

---

## 1. CSS Variables

### 1.1 Dark Theme (default)

```css
:root, [data-theme="dark"] {
    /* Backgrounds */
    --bg: #0d1117;
    --surface: #161b22;
    --surface-hover: #1c2128;
    --surface-elevated: #1c2128;

    /* Borders */
    --border: #30363d;
    --border-muted: #21262d;

    /* Text */
    --text: #c9d1d9;
    --text-secondary: #8b949e;
    --text-inverse: #0d1117;

    /* Accent */
    --accent: #58a6ff;
    --accent-hover: #79b8ff;
    --accent-muted: rgba(88, 166, 255, 0.15);

    /* Semantic */
    --success: #3fb950;
    --success-muted: rgba(63, 185, 80, 0.15);
    --warning: #d29922;
    --warning-muted: rgba(210, 153, 34, 0.15);
    --danger: #f85149;
    --danger-hover: #da3633;
    --danger-muted: rgba(248, 81, 73, 0.15);

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 16px 32px rgba(0, 0, 0, 0.5);

    /* Typography */
    --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-size-xs: 0.7rem;
    --font-size-sm: 0.75rem;
    --font-size-base: 0.875rem;
    --font-size-lg: 1rem;
    --font-size-xl: 1.25rem;
    --font-size-2xl: 1.5rem;

    /* Spacing */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;

    /* Radius */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;
    --radius-xl: 12px;
    --radius-full: 9999px;
}
```

### 1.2 Light Theme (Navy/Crimson)

```css
[data-theme="light"] {
    /* Backgrounds */
    --bg: #f8f9fc;
    --surface: #ffffff;
    --surface-hover: #f0f2f5;
    --surface-elevated: #ffffff;

    /* Borders */
    --border: #d0d7de;
    --border-muted: #e8ecf0;

    /* Text */
    --text: #1a1a2e;
    --text-secondary: #57606a;
    --text-inverse: #ffffff;

    /* Accent (Navy) */
    --accent: #1a1a2e;
    --accent-hover: #2d2d4e;
    --accent-muted: rgba(26, 26, 46, 0.1);

    /* Semantic */
    --success: #1a7f37;
    --success-muted: rgba(26, 127, 55, 0.1);
    --warning: #9a6700;
    --warning-muted: rgba(154, 103, 0, 0.1);
    --danger: #e94560;
    --danger-hover: #cf1322;
    --danger-muted: rgba(233, 69, 96, 0.1);

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
    --shadow-lg: 0 16px 32px rgba(0, 0, 0, 0.12);

    /* Typography, Spacing, Radius — same as dark (inherited from :root) */
}
```

---

## 2. Theme Toggle Implementation

```html
<!-- Toggle button in header -->
<button id="theme-toggle" aria-label="Toggle theme">🌙</button>
```

```javascript
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateToggleIcon(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateToggleIcon(next);
}

function updateToggleIcon(theme) {
    document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}
```

---

## 3. Component Patterns

All components use CSS variables — they automatically adapt to the active theme.

### 3.1 Buttons

| Variant | CSS |
|---------|-----|
| Primary | `background: var(--accent); color: var(--text-inverse); border-radius: var(--radius-md); padding: 8px 16px; border: none; font-weight: 600;` |
| Danger | `background: var(--danger); color: #fff; border-radius: var(--radius-md); padding: 8px 16px; border: none;` |
| Ghost | `background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: var(--radius-md); padding: 8px 16px;` |
| Success | `background: var(--success); color: #fff; border-radius: var(--radius-md); padding: 8px 16px; border: none;` |

### 3.2 Inputs

```css
input, select, textarea {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 8px 12px;
    color: var(--text);
    font-size: var(--font-size-base);
    font-family: var(--font-family);
}
input:focus, select:focus {
    border-color: var(--accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-muted);
}
```

### 3.3 Cards

```css
.card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    box-shadow: var(--shadow-sm);
}
```

### 3.4 Tables

```css
table { border-collapse: collapse; width: 100%; background: var(--surface); }
th {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 12px 16px;
    text-align: left;
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    font-weight: 600;
}
td { padding: 12px 16px; border-bottom: 1px solid var(--border-muted); color: var(--text); }
tr:hover { background: var(--surface-hover); }
```

### 3.5 Modals

```css
.modal-overlay { background: rgba(0, 0, 0, 0.5); }
.modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    max-width: 500px;
    padding: var(--spacing-lg);
}
```

### 3.6 Badges

| Variant | CSS |
|---------|-----|
| Success | `background: var(--success-muted); color: var(--success); border-radius: var(--radius-full); padding: 2px 8px; font-size: var(--font-size-sm);` |
| Danger | `background: var(--danger-muted); color: var(--danger); border-radius: var(--radius-full); padding: 2px 8px;` |
| Accent | `background: var(--accent-muted); color: var(--accent); border-radius: var(--radius-full); padding: 2px 8px;` |
| Warning | `background: var(--warning-muted); color: var(--warning); border-radius: var(--radius-full); padding: 2px 8px;` |

### 3.7 Progress Bar

```css
.progress-bar {
    height: 24px;
    background: var(--border-muted);
    border-radius: var(--radius-xl);
    overflow: hidden;
}
.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--success), #81c784);
    border-radius: var(--radius-xl);
    transition: width 0.5s ease;
}
```

---

## 4. Typography Scale

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title (H1) | `--font-size-2xl` (1.5rem) | 700 | `--text` |
| Section title (H2) | `--font-size-xl` (1.25rem) | 600 | `--text` |
| Subsection (H3) | `--font-size-lg` (1rem) | 600 | `--text` |
| Body text | `--font-size-base` (0.875rem) | 400 | `--text` |
| Caption/label | `--font-size-sm` (0.75rem) | 400 | `--text-secondary` |
| Tiny (badge) | `--font-size-xs` (0.7rem) | 600 | Varies |

---

## 5. Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-xs` | 4px | Tight gaps (badge padding, icon margins) |
| `--spacing-sm` | 8px | Element gaps (between buttons, form fields) |
| `--spacing-md` | 16px | Section padding, card internal spacing |
| `--spacing-lg` | 24px | Card padding, major section gaps |
| `--spacing-xl` | 32px | Page-level spacing, large section separators |

---

## 6. Accessibility

| Requirement | Dark Theme | Light Theme |
|-------------|-----------|-------------|
| Text contrast (WCAG AA) | `#c9d1d9` on `#0d1117` = 11.3:1 ✓ | `#1a1a2e` on `#f8f9fc` = 14.7:1 ✓ |
| Secondary text | `#8b949e` on `#161b22` = 4.6:1 ✓ | `#57606a` on `#ffffff` = 5.9:1 ✓ |
| Focus indicators | `box-shadow: 0 0 0 3px var(--accent-muted)` | Same |
| Min touch target | 44px × 44px for mobile | Same |
| Keyboard navigation | All interactive elements focusable | Same |

---

## 7. Applies To

| Page | Ticket | File |
|------|--------|------|
| Admin Panel | MTO-39 | `orchestrator-server/.../static/admin.html` |
| Graph Viewer | MTO-22, MTO-38 | `orchestrator-server/.../static/graph-viewer.html` |
| Sync Dashboard | MTO-21 | `orchestrator-server/.../static/sync-dashboard.html` |

All pages MUST use the shared CSS variables defined above. Theme toggle should be present in every page header.
