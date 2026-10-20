# User Guide (UG)

## ide_launch / Kiro — SA4E-373: Fix ide_launch DevToolsActivePort timeout for Kiro

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-373 |
| Title | Fix ide_launch DevToolsActivePort timeout for Kiro |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-373 |
| Related FSD | FSD-v1.0-SA4E-373 |
| Related TDD | TDD-v1.0-SA4E-373 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | DEV Agent | Initial document |

---

## 1. Introduction

### 1.1 Purpose

This User Guide describes how to use the `ide_launch` tool to reliably launch Kiro IDE with custom `userDataDir`, explicit `--remote-debugging-port`, and configurable timeout. It targets the DevToolsActivePort timeout issue that blocked manual UAT for SA4E-370.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| QA Engineer | How to launch Kiro with isolated userDataDir for manual UAT |
| Developer | How to configure explicit remote debugging port and timeout |
| System Administrator | How to troubleshoot launch failures and port conflicts |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Kiro IDE | latest | Yes |
| ide_launch tool | SA4E-373 | Yes |
| Node.js Runtime | 20.x | Yes |
| userDataDir path | writable | Optional |

---

## 2. Getting Started

### 2.1 Quick Start

```bash
# Launch Kiro with isolated userDataDir
ide_launch --ide kiro --userDataDir C:\temp\kiro-uat

# Launch with explicit remote debugging port for deterministic detection
ide_launch --ide kiro --userDataDir C:\temp\kiro-uat --remoteDebuggingPort 9222 --timeoutSeconds 60

# Verify launch success
# Expected output: launchSuccess=true, devToolsPort=9222, processPid=xxxxx
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 20.x | 20.x |
| OS | Windows 10/11 | Windows 11 |
| Disk | 500 MB free for userDataDir | 2 GB |
| Memory | 2 GB | 4 GB |

### 2.3 Distribution Formats

| Format | How to Get | Use Case |
|--------|-----------|----------|
| CLI tool | Extension Host bundle | Local QA/Developer workstation |

### 2.4 Configuration Methods

`ide_launch` accepts parameters via CLI arguments. Priority: CLI args override defaults.

| Method | Priority | Best For |
|--------|----------|----------|
| CLI flags | 1 | One-off launch |
| Default values | 2 | Standard launch without custom dir |

### 2.5 Verify Configuration

- Check 1: Kiro process starts — log `Launch start: ide=kiro, userDataDir=...`
- Check 2: Port detected — log `Port detected: 9222, elapsed=12s`
- Check 3: Success response — `launchSuccess=true`
- Common issues: see Section 7.1

---

## 3. Configuration

### 3.1 Configuration File

No config file. All parameters are CLI flags.

### 3.2 Configuration Reference

#### Launch Parameters

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| ide | string | — | IDE identifier. Must be `kiro` |
| userDataDir | string | temp dir | Custom user data directory for isolated Kiro launch |
| remoteDebuggingPort | integer | — | Explicit port to force remote debugging, 1024-65535 |
| timeoutSeconds | integer | 60 | Detection timeout for DevToolsActivePort, max 300 |

### 3.3 Environment Variables

None required.

### 3.4 Configuration Examples

#### Minimal Configuration

```bash
ide_launch --ide kiro
```

#### Full Configuration

```bash
ide_launch --ide kiro --userDataDir C:\temp\kiro-uat --remoteDebuggingPort 9222 --timeoutSeconds 60
```

---

## 4. Usage

### 4.1 Reliable Kiro launch with custom userDataDir

**Description:** Launch Kiro IDE with isolated profile and wait for DevTools readiness without timeout errors.

**How to use:**

```bash
ide_launch --ide kiro --userDataDir <path> [--remoteDebuggingPort <port>] [--timeoutSeconds <s>]
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userDataDir | string | No | Path must be accessible and writable |
| remoteDebuggingPort | integer | No | 1024-65535, not in use |
| timeoutSeconds | integer | No | >0, max 300 |

**Example:**

```bash
ide_launch --ide kiro --userDataDir C:\temp\kiro-uat --timeoutSeconds 60
```

**Expected Output:**

```json
{
  "launchSuccess": true,
  "devToolsPort": 9222,
  "processPid": 12345,
  "errorMessage": null
}
```

### 4.2 Explicit remote debugging port support

**Description:** Forward `--remote-debugging-port` flag to Kiro to make port exposure deterministic.

**How to use:**

```bash
ide_launch --ide kiro --remoteDebuggingPort 9222
```

**Example:**

```bash
ide_launch --ide kiro --userDataDir C:\temp\kiro-uat --remoteDebuggingPort 9222 --timeoutSeconds 60
```

**Expected Output:**

```json
{
  "launchSuccess": true,
  "devToolsPort": 9222,
  "processPid": 12345,
  "errorMessage": null
}
```

**Notes:**
- When `remoteDebuggingPort` is set, ide_launch skips auto-detection and verifies binding.
- This eliminates dependency on DevToolsActivePort file timing.

### 4.3 Default launch without custom dir

```bash
ide_launch --ide kiro
```
Existing behavior unchanged.

---

## 5. Administration

### 6.1 Monitoring Health

Check launch logs for `launch_duration_seconds` >60s. Review stderr for timeout errors.

### 6.2 Hot-Reload Configuration

No hot-reload. Parameters are per invocation.

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | `IDE did not expose DevToolsActivePort within 30s` | Custom userDataDir delays IDE init | Increase `--timeoutSeconds` to 60, or use `--remoteDebuggingPort` |
| 2 | `UserDataDir not accessible` | Path does not exist or not writable | Verify path exists and writable: `icacls C:\temp\kiro-uat` |
| 3 | `Remote debugging port already in use` | Port bound by another process | Choose different port 1024-65535 or free existing process |
| 4 | Kiro fails to start | Binary not found or crash | Verify Kiro installation path, check process exit code in logs |
| 5 | DevToolsActivePort timeout persists | Kiro does not support `--remote-debugging-port` | Increase timeout to 60-120s and ensure userDataDir is on fast disk |

### 7.2 Error Codes

| Code | Message | Description | Action |
|------|---------|-------------|--------|
| IdeLaunchError | UserDataDir not accessible | Path check fails | Create directory and grant write permission |
| IdeLaunchError | Remote debugging port already in use | Port bound | Select free port |
| IdeLaunchError | IDE did not expose DevToolsActivePort within Xs | Timeout | Increase timeout or set explicit port |

### 7.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| stdout | Launch start, port detected | Success verification |
| stderr | Timeout, validation errors | Troubleshooting |

### 7.4 FAQ

**Q: Why does custom userDataDir cause timeout?**
A: Kiro initializes extensions and state from scratch, increasing startup time and delaying DevToolsActivePort file creation.

**Q: Should I always use remoteDebuggingPort?**
A: Recommended for UAT/automation. It makes port deterministic and avoids polling.

**Q: What is the max timeout?**
A: 300 seconds per FSD validation.

**Q: Does this change affect existing launches?**
A: No. Launches without new parameters work unchanged.

---

## 8. API Reference

### 8.1 ide_launch

| Attribute | Value |
|-----------|-------|
| Name | ide_launch |
| Description | Launch Kiro IDE and wait for DevTools readiness |

**Input Schema:**

```json
{
  "ide": "kiro",
  "userDataDir": "string",
  "remoteDebuggingPort": 1024-65535,
  "timeoutSeconds": 1-300
}
```

**Example Request:**

```bash
ide_launch --ide kiro --userDataDir C:\temp\kiro-uat --remoteDebuggingPort 9222 --timeoutSeconds 60
```

**Example Response:**

```json
{
  "launchSuccess": true,
  "devToolsPort": 9222,
  "processPid": 12345,
  "errorMessage": null
}
```

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| DevToolsActivePort | File containing remote debugging port exposed by Kiro |
| userDataDir | Custom directory used by Kiro to store user settings for isolated launches |
| ide_launch | CLI tool for programmatically launching IDEs and waiting for devtools readiness |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-373/BRD.md |
| FSD | documents/SA4E-373/FSD.md |
| TDD | documents/SA4E-373/TDD.md |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|----------------|----------------|------------------|
| 1.0.0 | v1 | Initial release |
