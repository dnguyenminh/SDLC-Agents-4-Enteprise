# User Guide — KB Evolution Memory: Phase 3 Maintenance

## SA4E-36: Temporal Versioning & Outcome Tracking — Maintenance Layer

---

## 1. Overview

Phase 3 (Maintenance) adds three background services to the KB Evolution Memory system:

| Service | Purpose | Trigger |
|---------|---------|---------|
| **DecayService** | Reduce confidence of stale entries over time | Scheduled (every 24h) or manual |
| **StagnationDetector** | Identify repeated failed searches (KB gaps) | Scheduled (every 6h) or manual |
| **EpochService** | Flag entries for re-verification after major changes | Admin trigger via `mem_configure_decay` |

These services run automatically via the Evolution Scheduler on MemoryModule startup.

---

## 2. MCP Tools

### 2.1 `mem_verify` — Verify or Reject Flagged Entries

After an epoch trigger flags entries for re-verification, use this tool to verify or reject them.

**Input:**

```json
{
  "entry_id": 42,
  "action": "verify",
  "comment": "Confirmed still valid after v3.0 migration"
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| entry_id | number | Yes | — | Entry to verify/reject |
| action | string | No | "verify" | `verify` or `reject` |
| comment | string | No | — | Audit trail comment (max 500 chars) |

**Output:**

```json
{
  "verified": true,
  "entry_id": 42,
  "confidence": 1.0,
  "needs_verification": 0
}
```

**Actions:**
- `verify` → Sets `needs_verification=0`, `confidence=1.0`
- `reject` → Sets `archived=1`, `needs_verification=0`

**Error Codes:**

| Code | Cause |
|------|-------|
| ENTRY_NOT_FOUND | Entry ID does not exist |
| NOT_FLAGGED | Entry is not flagged for verification (`needs_verification != 1`) |

---

### 2.2 `mem_configure_decay` — Admin Configuration & Actions

Multi-action admin tool for decay configuration, epoch management, and diagnostics.

**Input:**

```json
{
  "action": "get_config"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | One of: `get_config`, `set_config`, `run_decay`, `epoch`, `stagnation_check` |
| halfLifeDays | number | No | For `set_config` (1–365) |
| decayRate | number | No | For `set_config` (0.01–0.50) |
| confidenceFloor | number | No | For `set_config` (0.01–0.50) |
| scope | string | No | For `epoch` action |
| epoch_id | string | No | For `epoch` action (max 100 chars) |

#### Action: `get_config`

Returns current decay configuration.

```json
{
  "halfLifeDays": 30,
  "decayRate": 0.05,
  "confidenceFloor": 0.1,
  "predictiveEnabled": false,
  "stagnationThreshold": 3,
  "stagnationWindowDays": 7,
  "decayIntervalHours": 24,
  "accessThresholdDays": 60
}
```

#### Action: `set_config`

Updates configuration values. Returns the updated config.

```json
{ "action": "set_config", "decayRate": 0.03, "confidenceFloor": 0.2 }
```

#### Action: `run_decay`

Manually triggers a decay cycle. Processes entries in batches of 100.

```json
{ "action": "run_decay" }
```

**Output:**
```json
{ "decayed_count": 47, "duration_ms": 120, "skipped_pinned": 0 }
```

#### Action: `epoch`

Triggers an epoch boundary — flags matching entries for re-verification.

```json
{ "action": "epoch", "scope": "PROJECT", "epoch_id": "v3.0-migration" }
```

**Output:**
```json
{ "epoch_id": "v3.0-migration", "affected_count": 12, "entry_ids": [1, 5, 8, ...] }
```

#### Action: `stagnation_check`

Analyzes search log for stagnation patterns (repeated failed queries).

```json
{ "action": "stagnation_check" }
```

**Output:**
```json
{
  "stagnant_queries": [
    { "query": "kubernetes helm deploy", "count": 5, "first_seen": "2025-07-10T..." }
  ],
  "count": 1
}
```

---

## 3. Configuration Reference

Configuration is stored in the `decay_config` database table:

| Key | Default | Range | Description |
|-----|---------|-------|-------------|
| halfLifeDays | 30 | 1–365 | Days for temporal weight to halve |
| decayRate | 0.05 | 0.01–0.50 | Confidence reduction per cycle (5%) |
| confidenceFloor | 0.1 | 0.01–0.50 | Minimum confidence (entries never go below) |
| predictiveEnabled | false | true/false | Enable predictive scoring |
| stagnationThreshold | 3 | 1–100 | Min failed query repetitions for stagnation flag |
| stagnationWindowDays | 7 | 1–90 | Window for stagnation analysis |
| decayIntervalHours | 24 | 1–168 | How often the decay job runs |
| accessThresholdDays | 60 | 1–365 | Days without access before decay applies |

---

## 4. Decay Formula

```
new_confidence = MAX(current_confidence * (1 - decayRate), confidenceFloor)
```

**Conditions for decay:**
- Entry is NOT pinned (`pinned = 0`)
- Entry confidence is above floor
- Entry `last_accessed_at` is older than `accessThresholdDays` (or NULL)
- Entry is not archived

**Batch processing:** 100 entries per transaction. On batch failure, previous batches are committed and processing continues.

---

## 5. Epoch Workflow

1. **Trigger**: Admin calls `mem_configure_decay` with `action: "epoch"`
2. **Flag**: All matching entries get `needs_verification=1` and the epoch_id
3. **Review**: Agent or human uses `mem_verify` to verify or reject each entry
4. **Verify**: Entry gets `confidence=1.0`, flag cleared
5. **Reject**: Entry gets `archived=1`, flag cleared

Use epochs when:
- Major framework version upgrade
- Breaking API change in dependent system
- Knowledge domain restructuring

---

## 6. Background Scheduler

The scheduler starts automatically with MemoryModule and runs:
- **Decay job**: Every `decayIntervalHours` (default 24h)
- **Stagnation check**: Every 6 hours

Both jobs are non-blocking. If decay is already running (e.g., triggered manually), the scheduled run is silently skipped (`JOB_IN_PROGRESS`).

The scheduler is stopped cleanly on MemoryModule shutdown.

---

## 7. Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| `JOB_IN_PROGRESS` error on `run_decay` | Previous decay cycle still running | Wait for current cycle to complete |
| `NOT_FLAGGED` error on `mem_verify` | Entry not flagged for verification | Trigger an epoch first, or check `needs_verification` field |
| `ENTRY_NOT_FOUND` | Invalid entry_id | Verify entry exists with `mem_search` |
| Stagnation returns empty | No search_log table or no failed queries | Normal — KB is meeting search needs |
| Decay not reducing confidence | Entries are pinned or recently accessed | Check `pinned` flag and `last_accessed_at` |

---

## 8. Error Codes

| Code | Tool | Description |
|------|------|-------------|
| ENTRY_NOT_FOUND | mem_verify | Entry ID does not exist |
| NOT_FLAGGED | mem_verify | Entry is not flagged (`needs_verification != 1`) |
| INVALID_ACTION | mem_configure_decay | Unknown action parameter |
| INVALID_CONFIG | mem_configure_decay | Invalid config values or missing required params |
| JOB_IN_PROGRESS | mem_configure_decay (run_decay) | Decay job already running |
| DECAY_ERROR | mem_configure_decay | Unexpected error during decay operation |
