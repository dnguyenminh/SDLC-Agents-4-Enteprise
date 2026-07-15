# User Guide — SA4E-37: Health Check & Auto-Reconnect

## 1. Overview

The Health Check & Auto-Reconnect subsystem monitors child MCP server connections and automatically recovers from silent disconnections. It runs transparently inside `McpClientManager` — no manual intervention is needed for typical operation.

---

## 2. Quick Start

Health monitoring starts automatically when `OrchestrationModule.initialize()` completes. No additional setup is required for default behavior.

```typescript
// Health monitor starts automatically on module init.
// To customize config before init:
clientManager.setHealthCheckConfig({ interval: 15000, maxRetries: 5 });
```

---

## 3. Configuration Reference

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `interval` | 30,000 ms | 5,000–300,000 | Time between health check cycles |
| `pingTimeout` | 5,000 ms | 1,000–30,000 | Max wait for a single ping response |
| `failureThreshold` | 2 | 1–10 | Consecutive failures before marking unhealthy |
| `initialDelay` | 1,000 ms | 100–10,000 | First reconnect attempt delay |
| `backoffMultiplier` | 2 | 1.5–4 | Multiplier applied per retry |
| `maxDelay` | 30,000 ms | 5,000–300,000 | Maximum backoff cap |
| `maxRetries` | 10 | 1–50 | Attempts before marking server `failed` |
| `jitterEnabled` | true | — | Add ±20% randomness to delays |
| `jitterRange` | 0.2 | 0–0.5 | Jitter range (decimal) |

### Updating Configuration at Runtime

```typescript
clientManager.setHealthCheckConfig({
  interval: 20000,
  failureThreshold: 3,
  maxRetries: 15,
});
```

---

## 4. Connection States

| State | Meaning | Tool Calls Allowed? |
|-------|---------|---------------------|
| `connected` | Server responding normally | ✅ Yes |
| `unhealthy` | Ping failures breached threshold | ❌ No (transitional) |
| `reconnecting` | Active reconnection in progress | ❌ No |
| `failed` | Max retries exhausted | ❌ No |
| `disconnected` | Manually disconnected or not yet connected | ❌ No |

---

## 5. Usage

### 5.1 Subscribe to State Changes

```typescript
const unsubscribe = clientManager.onServerStateChange((event) => {
  console.log(`${event.serverName}: ${event.previousState} → ${event.newState}`);
  if (event.error) console.log(`  Error: ${event.error}`);
});

// Later, to unsubscribe:
unsubscribe();
```

### 5.2 Query Server Status

```typescript
const statuses = clientManager.getServersStatus();
// Returns: ServerStatusEntry[] with state, toolCount, lastHealthCheck, etc.
```

### 5.3 Manual Reconnect (for failed servers)

```typescript
try {
  await clientManager.reconnectServer('atlassian');
} catch (err) {
  // "Unknown server: X" or "Cannot reconnect manually disconnected server"
}
```

### 5.4 Stop/Start Health Monitor

```typescript
clientManager.stopHealthMonitor();  // Pause monitoring
clientManager.startHealthMonitor(); // Resume monitoring
```

---

## 6. Error Messages

| Server State | Error When Calling Tool |
|--------------|------------------------|
| `reconnecting` | `Server '{name}' is currently reconnecting (attempt N/10). Tool call rejected.` |
| `failed` | `Server '{name}' has failed after 10 reconnect attempts. Manual reconnection required.` |
| `unhealthy` | `Server '{name}' is unhealthy. Reconnection will be attempted shortly.` |

---

## 7. Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Server stuck in `reconnecting` | Child process crashed or URL unreachable | Check server logs; verify command/URL config |
| Server marked `failed` | Network outage or persistent server crash | Fix root cause, then call `reconnectServer(name)` |
| Frequent `unhealthy` transitions | Slow server responses near 5s timeout | Increase `pingTimeout` via `setHealthCheckConfig` |
| No health check events | Monitor not started | Verify `startHealthMonitor()` was called |

---

## 8. Architecture

```
OrchestrationModule
  └── McpClientManager (Facade)
        ├── HealthMonitor        — setInterval, parallel pings
        ├── ReconnectManager     — exponential backoff, transport recreation
        ├── ConnectionStateTracker — state machine, event callbacks
        └── TransportFactory     — creates stdio/sse/httpStream transports
```

---

## 9. Backward Compatibility

The `getServersStatus()` method returns `ServerStatusEntry[]` which includes the original `name`, `connected`, and `toolCount` fields. Existing consumers continue to work unchanged.
