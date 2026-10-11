# Reference Analysis — SA4E-351

## Pattern: WebSocket Reconnection with Exponential Backoff

### Reference 1: socket.io-client (https://github.com/socketio/socket.io-client)
- **Architecture**: Built-in reconnection manager with configurable attempts, delay, and randomization
- **Key patterns**:
  - `reconnection: true` (default), `reconnectionAttempts: Infinity`, `reconnectionDelay: 1000`, `reconnectionDelayMax: 5000`
  - Exponential backoff with jitter: `delay * Math.pow(factor, attempt) + random()`
  - Events: `reconnecting`, `reconnect`, `reconnect_failed`, `disconnect`
  - Auto-reconnect on `close` with code 1006 (abnormal closure)
- **Strengths**: Battle-tested, handles all edge cases (network flapping, server restart, proxy timeouts)

### Reference 2: ws library (https://github.com/websockets/ws)
- **Architecture**: Minimal WebSocket implementation; reconnection left to consumer
- **Key patterns**:
  - `WebSocket` class emits `close` event with `code` and `reason`
  - Common wrapper pattern: `new ReconnectingWebSocket(url, protocols, options)`
  - Options: `maxRetries`, `reconnectionDelayGrowFactor`, `minReconnectionDelay`, `maxReconnectionDelay`
  - Connection state machine: `CONNECTING` → `OPEN` → `CLOSING` → `CLOSED` → (reconnect) → `CONNECTING`
- **Strengths**: Lightweight, no dependencies, explicit control over reconnection logic

### Reference 3: VS Code Extension Host / WebSocket (https://github.com/microsoft/vscode)
- **Architecture**: VS Code uses WebSocket for extension host communication; handles workbench reloads
- **Key patterns**:
  - Extension host crashes trigger reconnection from client side
  - Uses `vscode-ws-jsonrpc` with built-in reconnection
  - Heartbeat/ping-pong to detect stale connections
  - Graceful shutdown protocol before force close
- **Strengths**: Production-grade, handles workbench reload/crash scenarios exactly like our use case

### Reference 4: WebdriverIO wdio-vscode-service (https://github.com/webdriverio-community/wdio-vscode-service)
- **Architecture**: Current implementation — no reconnection logic in `_handleSocketClose`
- **Key patterns**:
  - `service.ts` line 70: `_handleSocketClose(event)` — only logs, no reconnect
  - Socket created in `_connect()` method, no retry mechanism
  - Workbench lifecycle events not handled for socket recovery
- **Gap**: This is exactly the code we need to patch

### Patterns to adopt in our BRD/TDD:
- [ ] **Exponential backoff with jitter** — Prevent thundering herd on workbench restart
- [ ] **Max retry attempts with cap** — Avoid infinite loops (configurable, default 10)
- [ ] **Reconnection state machine** — Track: `CONNECTING` → `OPEN` → `RECONNECTING` → `OPEN` / `FAILED`
- [ ] **Heartbeat/ping-pong** — Detect stale connections before 1006 occurs
- [ ] **Graceful shutdown protocol** — Distinguish intentional close (1000) vs abnormal (1006)
- [ ] **Workbench lifecycle awareness** — Listen for workbench reload/crash events, trigger proactive reconnect
- [ ] **Configuration via wdio config** — `vscodeService: { reconnect: { maxAttempts, baseDelay, maxDelay, factor } }`
- [ ] **Observability** — Log reconnection attempts, duration, final outcome for CI debugging

---

**Ingested to KB:** `mem_ingest(content="REFERENCE-ANALYSIS | ticket=SA4E-351 | pattern=websocket-reconnect-exponential-backoff | refs=socket.io-client, ws, vscode, wdio-vscode-service | key_patterns=exponential-backoff-jitter, state-machine, heartbeat, graceful-shutdown, workbench-lifecycle, config-driven, observability", type="ARCHITECTURE", source="reference-analysis/SA4E-351", tags="reference,prior-art,websocket,reconnect", scope="PROJECT")`