# 🔒 Security Review - Design Phase

## Document Information
| Field | Value |
|-------|-------|
| Project | ide_launch / Kiro |
| Ticket | SA4E-373 |
| Scope | Technical Design for DevToolsActivePort fix |
| Date | 2026-10-19 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary
Security review of TDD for ide_launch DevToolsActivePort timeout fix. Design introduces explicit remote debugging port forwarding and configurable timeout with userDataDir validation. Overall risk rating: **High**.

Key concerns:
- Remote debugging port can be exposed beyond localhost with no binding restriction enforcement
- userDataDir validation limited to existsSync + writable check; no canonicalization, symlink protection, or sandboxing
- Process spawning via child_process.spawn with user-controlled paths and ports; insufficient input validation and command injection mitigation
- No authentication/authorization for debugger access; DevTools Protocol allows arbitrary code execution

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 High | 2 |
| 🟡 Medium | 2 |
| 🔵 Low | 1 |
| ℹ️ Informational | 1 |

## Findings by OWASP Top 10

### A01:2021 — Broken Access Control
**Finding-3:** Missing binding scope enforcement for remote debugging port
**Finding-5:** No authentication for DevTools access

### A02:2021 — Cryptographic Failures
No issues found ✅

### A03:2021 — Injection
**Finding-2:** userDataDir path traversal / symlink attack
**Finding-4:** Process spawning with unvalidated user input → OS command injection risk

### A04:2021 — Insecure Design
**Finding-1:** Remote debugging port exposure design allows network accessible debugger
**Finding-3:** No defense-in-depth for port exposure

### A05:2021 — Security Misconfiguration
**Finding-1:** Port may bind to 0.0.0.0
**Finding-6:** Logging of sensitive parameters

### A06:2021 — Vulnerable and Outdated Components
No issues found ✅

### A07:2021 — Identification and Authentication Failures
**Finding-5:** DevTools access unauthenticated

### A08:2021 — Software and Data Integrity Failures
No issues found ✅

### A09:2021 — Security Logging and Monitoring Failures
**Finding-6:** Port and userDataDir logged without masking

### A10:2021 — Server-Side Request Forgery (SSRF)
No issues found ✅

## Detailed Findings

### Finding #1: Remote Debugging Port Network Exposure
| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A05 Security Misconfiguration / A01 Broken Access Control |
| **CWE** | CWE-200 Information Exposure, CWE-200 |
| **CVSS Score** | 7.5 |
| **Location** | TDD.md §7.3, §3.1, FSD §7.2 |
| **Status** | Open |

**Description:**
Design allows remoteDebuggingPort to be forwarded to Kiro via --remote-debugging-port without enforcing binding to localhost. TDD §7.3 states "Port exposure should remain localhost only. Do not bind to 0.0.0.0." However no technical enforcement, validation, or CLI flag to restrict binding is described. If Kiro defaults to 0.0.0.0 or user runs on multi-homed host, debugger becomes network accessible.

**Evidence:**
> Port exposure should remain localhost only. Do not bind to 0.0.0.0.
> *TDD.md §7.3*

> remoteDebuggingPort: integer | No | — | Explicit port 1024-65535
> *TDD.md §3.2*

**Impact:**
Attacker on same network can connect to Chrome DevTools Protocol, gain arbitrary code execution in renderer context, exfiltrate userDataDir contents, manipulate files.

**Remediation:**
Enforce localhost binding via wrapper flags if supported by Kiro; validate port binding via netstat check post-launch; reject ports already bound externally; document requirement that port must be bound to 127.0.0.1 only. Add runtime check:
```typescript
const net = require('net');
function enforceLocalhost(port: number) {
  // verify listening socket is 127.0.0.1 only
}
```

### Finding #2: userDataDir Path Traversal and Symlink Attack
| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A03 Injection |
| **CWE** | CWE-22 Path Traversal, CWE-59 |
| **CVSS Score** | 7.8 |
| **Location** | TDD.md §7.4, §3.1 |
| **Status** | Open |

**Description:**
Validation for userDataDir is limited to fs.existsSync + writable check. No canonicalization, realpath resolution, symlink validation, or sandbox root enforcement. Attacker can supply path like ../../../../etc or symlink to sensitive directory.

**Evidence:**
> userDataDir: fs.existsSync + writable check
> *TDD.md §7.4*

**Impact:**
Process spawned with userDataDir pointing outside intended scope can read/write arbitrary files, lead to privilege escalation or data leakage.

**Remediation:**
Canonicalize path with fs.realpathSync, enforce prefix under allowed base directory, reject symlinks, normalize path separators:
```typescript
import { realpathSync, existsSync, accessSync } from 'fs';
const safeBase = '/allowed/base';
const resolved = realpathSync(userDataDir);
if (!resolved.startsWith(safeBase)) throw new Error('Path outside sandbox');
```

### Finding #3: Process Spawning with Unvalidated User Input
| Attribute | Value |
|-----------|-------|
| **Severity** | Critical |
| **OWASP Category** | A03 Injection |
| **CWE** | CWE-78 OS Command Injection |
| **CVSS Score** | 9.1 |
| **Location** | TDD.md §1.3, §5.2, §6.1 |
| **Status** | Open |

**Description:**
IdeSessionManager spawns Kiro process using child_process.spawn with user-controlled userDataDir, remoteDebuggingPort, and optional ideBinaryPath. Design does not specify argument sanitization, whitelist validation of binary path, or prevention of argument injection via crafted paths containing spaces/quotes. No mention of using spawn with array args vs string shell.

**Evidence:**
> Process spawn | child_process.spawn | Node built-in
> *TDD.md §1.3*

> ideBinaryPath?: string
> *TDD.md §5.2*

**Impact:**
Malicious userDataDir like `C:\temp; cmd.exe` or with shell metacharacters can lead to arbitrary command execution under extension host privileges.

**Remediation:**
Use spawn with array arguments only, never shell:true. Validate ideBinaryPath against whitelist. Sanitize and normalize all path inputs. Reject paths containing null bytes, control chars, or separator tricks.

### Finding #4: Missing Authentication for DevTools Protocol
| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A07 Identification and Authentication Failures |
| **CWE** | CWE-306 Missing Authentication |
| **CVSS Score** | 6.5 |
| **Location** | TDD.md §7.1, §7.2 |
| **Status** | Open |

**Description:**
DevTools remote debugging port provides unauthenticated access to Chrome DevTools Protocol. Design has no authentication layer, token, or access control for debugger connections.

**Impact:**
Any local or network attacker can attach debugger and execute arbitrary actions.

**Remediation:**
If Kiro supports --remote-debugging-port with authentication token, require it. Otherwise limit binding to localhost and document risk. Add warning in logs and user guide.

### Finding #5: Information Disclosure in Logs
| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A09 Security Logging and Monitoring Failures |
| **CWE** | CWE-532 Insertion of Sensitive Information into Log File |
| **CVSS Score** | 3.2 |
| **Location** | TDD.md §9.1 |
| **Status** | Open |

**Description:**
Logging includes userDataDir path and port. TDD §9.1 logs launch start with ide, userDataDir, port. Paths may contain PII.

**Remediation:**
Mask userDataDir to basename only; log port only on error; avoid logging full path in production.

### Finding #6: Timeout Configurable up to 300s Enables Resource Exhaustion
| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A05 Security Misconfiguration |
| **CWE** | CWE-400 Uncontrolled Resource Consumption |
| **CVSS Score** | 5.3 |
| **Location** | TDD.md §1.5, §3.1 |
| **Status** | Open |

**Description:**
timeoutSeconds configurable up to 300s with no rate limiting. Repeated launches could exhaust resources.

**Remediation:**
Add per-user rate limiting and max concurrent launches.

## Security Headers Assessment
N/A — CLI tool

## Remediation Priority
| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Process spawning injection | Medium | Prevent RCE |
| 2 | Remote debugging port network exposure | Low | Prevent debugger hijack |
| 3 | userDataDir path traversal | Medium | Prevent file access abuse |

## Recommendations Summary
### Immediate Actions
1. Enforce localhost-only binding for remote debugging port with runtime verification
2. Use spawn with array args, whitelist ideBinaryPath, canonicalize userDataDir with realpath and sandbox prefix
3. Add path traversal and symlink checks

### Short-term
1. Mask sensitive data in logs
2. Add rate limiting for launches
3. Document security assumptions and limitations

### Long-term
1. Evaluate authentication token support for DevTools
2. Add security tests for injection vectors

## Appendix
### Tools & Methodology
Static design review against OWASP Top 10, CWE, TDD/FSD/BRD

### Scope Limitations
Static design review only; code not inspected. Runtime behavior and Kiro flag support assumed.
