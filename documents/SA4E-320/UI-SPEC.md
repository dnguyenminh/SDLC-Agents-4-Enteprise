# UI Spec — SA4E-320: Opt-in Bypass HTTPS Enforcement (Backend MCP Server Card)

**Panel:** Settings webview (`SettingsPanel.ts` → `getHtml()`), tab **Server Settings**, card `#backend-mcp-section`
**Stack:** Static HTML webview + vanilla JS (`settings.js`) + VS Code CSS variables (`settings.css`)
**New VS Code setting:** `kiroSdlc.backend.allowInsecureRemote` — `boolean`, default `false`

---

## 1. Placement (DOM order inside `#backend-mcp-section`)

```
1. <h2> 🌐 Backend MCP Server </h2>
2. <p class="card-desc">…</p>
3. .form-group  → Backend URL input          (EXISTING, unchanged)
4. .form-group.checkbox-group → NEW checkbox + warning   ← INSERT HERE
5. .btn-row  → Save URL / Test Connection    (EXISTING, unchanged)
6. #backend-test-result (.status-indicator)  (EXISTING, unchanged)
```

The checkbox block sits **below the Backend URL input, above the button row** — i.e. between the
URL `.form-group` and the `.btn-row`. No existing element moves.

### Exact HTML to insert

```html
<div class="form-group checkbox-group">
  <label for="allow-insecure-remote-chk">
    <input type="checkbox" id="allow-insecure-remote-chk"
           aria-describedby="allow-insecure-remote-warning">
    Bypass HTTPS requirement for remote server
  </label>
  <div id="allow-insecure-remote-warning" class="status-indicator warning" hidden>
    ⚠️ Traffic to a remote backend will be sent as unencrypted HTTP —
    credentials and data can be intercepted. Only enable on trusted private networks.
  </div>
</div>
```

---

## 2. Copy (exact text)

| Element | Text |
|---|---|
| Checkbox label (always visible) | `Bypass HTTPS requirement for remote server` |
| Warning — **unchecked** | Not rendered (`hidden` attribute present). No helper text. |
| Warning — **checked** | `⚠️ Traffic to a remote backend will be sent as unencrypted HTTP — credentials and data can be intercepted. Only enable on trusted private networks.` |

Default state: **unchecked** (setting default `false`).

---

## 3. Element IDs & classes

| Element | id | classes | Notes |
|---|---|---|---|
| Wrapper | — | `form-group checkbox-group` | Matches existing checkbox rows (e.g. `enable-mcp-server-chk` row in `#wrapper-mcp-section`) |
| Checkbox | `allow-insecure-remote-chk` | — | `-chk` suffix = existing convention for checkboxes (`use-default-url-chk`, `enable-mcp-server-chk`). Suggested `-input` id would clash with the text-input naming convention. |
| Warning | `allow-insecure-remote-warning` | `status-indicator warning` | Reuses existing amber style — **zero new CSS required** |

---

## 4. Visual treatment

- **Checkbox:** native VS Code checkbox styled by existing rules
  `.checkbox-group input[type="checkbox"] { accent-color: var(--vscode-button-background) }` — identical to other settings checkboxes.
- **Warning:** existing `.status-indicator.warning`
  → `color: var(--vscode-editorWarning-foreground, #cca700)` (amber),
  `font-size: 12px`, `margin-top: 8px`. Visible **only when checked** (toggle `hidden` attribute).
- No new colors, no new CSS classes. Amber (not red) chosen because the action is allowed-by-design opt-in, matching how other in-panel warnings render (e.g. "⚠️ No key set").

---

## 5. Behavior & message contract

### Initial load
- `ProviderConfigService.getCurrentState()` gains field:
  `allowInsecureRemote: config.get<boolean>("backend.allowInsecureRemote", false)`
- Extension → webview: existing `state` message now carries `allowInsecureRemote: boolean`.
- `settings.js` `handleState()`:
  ```js
  if (msg.allowInsecureRemote !== undefined) {
    allowInsecureChk.checked = msg.allowInsecureRemote;
    allowInsecureWarning.hidden = !allowInsecureChk.checked;
  }
  ```

### Change (webview → extension)

```
{ type: "setAllowInsecureRemote", enabled: boolean }
```

- Fired immediately on the checkbox `change` event (not deferred to a Save button — the flag is
  security-relevant and must be persisted before any subsequent Save/Test reads it).
- Handler in `SettingsMessageHandler` (pattern = `handleSetEnableMcp`):
  ```ts
  case "setAllowInsecureRemote":
    await vscode.workspace.getConfiguration("kiroSdlc")
      .update("backend.allowInsecureRemote", msg.enabled, vscode.ConfigurationTarget.Workspace);
    break;
  ```
  (Workspace target = same scope as existing `backend.url` update.)
- On the same `change` event, webview toggles `allowInsecureWarning.hidden = !checked`.

### Persistence
- VS Code workspace setting `kiroSdlc.backend.allowInsecureRemote` (declare in
  `extension/package.json` → `contributes.configuration`, type `boolean`, default `false`).
- Optional feedback: reuse `showStatus(backendResult, "Saved ✓", "success")` after write — not required.

### Interplay with Save URL / Test Connection
- **Message payloads unchanged:** `setBackendUrl { url }` and `testBackendConnection { url }` stay as-is.
- Validation of HTTPS enforcement happens **server-side in the handler**, reading the flag fresh
  from config (`config.get("backend.allowInsecureRemote")`) at validation time:
  - Bypass **OFF** + remote `http://` URL → Save rejected (existing enforcement).
  - Bypass **ON** + remote `http://` URL → **Save succeeds**, Test Connection proceeds.
- Ordering guarantee: checkbox `change` posts `setAllowInsecureRemote` before the user can click
  `Save URL` (DOM event → postMessage is FIFO); the handler for `setAllowInsecureRemote` must be
  `await`ed to completion so config is written before the later `setBackendUrl` message validates.

---

## 6. Accessibility

| Requirement | Implementation |
|---|---|
| Label association | Input wrapped inside `<label for="allow-insecure-remote-chk">` — implicit + explicit association |
| Warning association | `aria-describedby="allow-insecure-remote-warning"` on the checkbox input |
| Warning visibility | `hidden` attribute toggled with checked state → removed from a11y tree when unchecked; announced when revealed (add `aria-live="polite"` on the warning div as a nice-to-have) |
| Keyboard | Native checkbox — tabbable, Space toggles, no extra work |
| Contrast | Amber `--vscode-editorWarning-foreground` is theme-provided (WCAG-compliant in default themes) |

---

## DEV checklist

1. `SettingsPanel.ts` — insert HTML block above (section 1) into `#backend-mcp-section`.
2. `settings.js` — element refs, `change` listener (post + toggle warning), `handleState` branch.
3. `SettingsMessageHandler.ts` — `setAllowInsecureRemote` case; add flag read to HTTPS enforcement in `handleSetBackendUrl` / `handleTestBackend`.
4. `ProviderConfigService.ts` — add `allowInsecureRemote` to `getCurrentState()`.
5. `extension/package.json` — contribute `kiroSdlc.backend.allowInsecureRemote` (boolean, default `false`).
6. No new CSS.
