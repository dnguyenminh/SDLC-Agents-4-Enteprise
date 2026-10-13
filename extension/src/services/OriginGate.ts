/**
 * OriginGate — pure Origin/Host validation gate for WrapperServer (SA4E-358).
 * Closes SA-01 (SA4E-356): unconditional ACAO wildcard + no authN on :9181.
 * Branches: no-Origin → PASS echoOrigin=null; allowlisted → PASS echo RAW; else
 * DENY. Contract (TDD v1.1 §3): G-1 never throws · G-2 pure · G-3 deny payloads
 * sanitized INSIDE · G-4 echo RAW trimmed · G-6 fail-closed · G-8 case-fold +
 * numeric port · I-8 Phase 1.5 validates Host for EVERY request with one
 * (SEC-358-01 Opt A); carve-out: no-Origin + NO Host (HTTP/1.0 legacy).
 */
import { sanitizeLogText } from "./PathResolver";

/** Machine-readable deny reason (FR-09) — server log only, never the response. */
export type OriginDenyReason = "origin-not-allowed" | "host-mismatch" | "malformed-origin";

/** Allowlist pattern (BR-09, FSD §3.1.4.1) — extend = code change + test. */
export interface AllowedOriginPattern {
  scheme: "vscode-webview" | "http" | "https";
  host: "*" | "localhost" | "127.0.0.1"; // "*" = any host ID (vscode-webview)
  port: "*"; // "*" = any port (Host check still uses the EXACT port — FR-04)
}

/** Immutable allowlist — never exposed as a mutable reference (BR-09, §8.3). */
export const ALLOWED_ORIGIN_PATTERNS: readonly AllowedOriginPattern[] = [
  { scheme: "vscode-webview", host: "*", port: "*" },
  { scheme: "http", host: "localhost", port: "*" },
  { scheme: "https", host: "localhost", port: "*" },
  { scheme: "http", host: "127.0.0.1", port: "*" },
];

/** PASS — route continues. echoOrigin null = no-Origin → no CORS headers (G-5). */
export interface OriginGatePass {
  ok: true;
  /** RAW trimmed Origin to echo (G-4) — not url.origin. null = no-Origin. */
  echoOrigin: string | null;
}

/** DENY — 403 + one log line. Header values already sanitized (G-3, BR-04). */
export interface OriginGateDeny {
  ok: false;
  reason: OriginDenyReason;
  originSanitized: string; // sanitized — may be empty
  hostSanitized: string; // sanitized — may be empty
}

/** Discriminated union — caller MUST check `.ok` before reading other fields. */
export type OriginGateResult = OriginGatePass | OriginGateDeny;

/** Header bundle extracted from rawHeaders (exported for isolated unit tests). */
export interface GateHeaders {
  origin: string | undefined;
  host: string | undefined;
  duplicateOrigin: boolean; // >1 `origin` key in rawHeaders (R-6 — fail-closed FR-12)
  duplicateHost: boolean; // >1 `host` key (request-smuggling surface — fail-closed)
}

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

/** Internal scan bundle — superset of GateHeaders with the raw value lists. */
interface GateHeadersScan extends GateHeaders {
  originValues: string[]; // deny-payload join (TDD §3.4)
  hostValues: string[]; // deny-payload join (TDD §3.4)
}

/**
 * Extract Origin/Host from req.rawHeaders — version-independent (NOT
 * req.headers join semantics). Flat [name, value] pairs, keys lowercase;
 * odd-length/empty input never throws (loop guard — E-5).
 */
export function extractGateHeaders(rawHeaders: readonly string[]): GateHeaders {
  const s = scanGateHeaders(rawHeaders);
  return { origin: s.origin, host: s.host, duplicateOrigin: s.duplicateOrigin, duplicateHost: s.duplicateHost };
}

function scanGateHeaders(rawHeaders: readonly string[]): GateHeadersScan {
  let origin: string | undefined;
  let host: string | undefined;
  let originCount = 0;
  let hostCount = 0;
  const originValues: string[] = [];
  const hostValues: string[] = [];
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const key = rawHeaders[i].toLowerCase();
    if (key === "origin") {
      originCount++;
      originValues.push(rawHeaders[i + 1]);
      origin = rawHeaders[i + 1];
    } else if (key === "host") {
      hostCount++;
      hostValues.push(rawHeaders[i + 1]);
      host = rawHeaders[i + 1];
    }
  }
  return {
    origin, host,
    duplicateOrigin: originCount > 1, duplicateHost: hostCount > 1,
    originValues, hostValues,
  };
}

/**
 * Host validation shared by Phase 1.5 (every request with a Host) and Phase 5
 * (idempotent). null = valid, else the invalid value. Manual parse (never URL
 * constructor): shorthand 127.1 / 0.0.0.0 deliberately NOT normalized (LH-14/15).
 */
function validateHostParts(host: string, listenPort: number): string | null {
  if (host.startsWith("[")) return host; // IPv6 literal "[::1]:9181" — deny (P5b)
  const idx = host.lastIndexOf(":");
  const hostName = idx < 0 ? host : host.slice(0, idx);
  const hostPort = idx < 0 ? undefined : host.slice(idx + 1);
  if (!LOOPBACK_HOSTNAMES.has(hostName.toLowerCase())) return host; // P5d
  let effectivePort: number;
  if (hostPort === undefined) {
    effectivePort = 80; // HTTP/1.1 default when Host carries no port
  } else if (/^\d+$/.test(hostPort)) {
    effectivePort = parseInt(hostPort, 10); // ":09181" === 9181 (numeric — G-8)
  } else {
    return host; // ":", "abc", "9181:extra" — malformed port (P5c)
  }
  return effectivePort !== listenPort ? host : null; // P5e — exact listen port (BR-03)
}

function deny(reason: OriginDenyReason, origin: string, host: string): OriginGateDeny {
  return { ok: false, reason, originSanitized: sanitizeLogText(origin), hostSanitized: sanitizeLogText(host) };
}

/**
 * Origin/Host gate — PURE: no I/O, NEVER throws (G-1); every failure is an
 * OriginGateDeny. 7 phases (FSD §6.1 v1.2 / TDD §3.3 v1.1): 1 extract +
 * duplicates (fail-closed, no first-wins) · 1.5 Host validate EVERY request
 * with a Host (I-8); empty Host defers · 2 no-Origin → PASS echoOrigin=null
 * (BR-06; HTTP/1.0 carve-out) · 3 parse/normalize Origin · 4 allowlist (exact
 * membership — no substring, BR-02) · 5 Host required when Origin present
 * (EF-1) · 6 PASS. @param rawHeaders req.rawHeaders (via WrapperServer) ·
 * @param listenPort port actually listening — srv.address().port, never
 * hardcoded 9181 (start(0) tests → G-7); null/0 fails every Host check → fail-closed (AD-7).
 */
export function evaluateOriginGate(
  rawHeaders: readonly string[],
  listenPort: number,
): OriginGateResult {
  // ── Phase 1 — extract (version-independent) ──────────────────────────────
  const h = scanGateHeaders(rawHeaders);
  if (h.duplicateOrigin) {
    // No first-wins: Origin is not a list-header (RFC 7230 §3.2.2) — FR-12.
    return deny("malformed-origin", h.originValues.join(", "), h.host ?? "");
  }
  if (h.duplicateHost) {
    return deny("host-mismatch", h.origin ?? "", h.hostValues.join(", "));
  }
  const origin = h.origin?.trim() ?? "";
  const host = h.host?.trim() ?? "";

  // ── Phase 1.5 — Host validate — EVERY request carrying a Host (I-8) ──────
  if (host !== "" && validateHostParts(host, listenPort) !== null) {
    return deny("host-mismatch", origin, host);
  }
  // ── Phase 2 — no-Origin branch (FR-02a, BR-06) ─────────────────────────
  if (origin === "") {
    return { ok: true, echoOrigin: null }; // Host already validated or absent
  }

  // ── Phase 3 — parse/normalize Origin (FR-12) ─────────────────────────────
  if (origin.includes(",")) return deny("malformed-origin", origin, host);
  // SEC-358-05 defense-in-depth: WHATWG URL strips \t\n\r inside the value —
  // deny BEFORE new URL so forged control chars never reach URL parsing.
  if (/[\t\n\r\f\v]/.test(origin)) return deny("malformed-origin", origin, host);
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return deny("malformed-origin", origin, host);
  }
  if (url.hostname === "") return deny("malformed-origin", origin, host); // scheme-only
  const scheme = url.protocol.slice(0, -1).toLowerCase(); // "https:" → "https"
  const hostname = url.hostname.toLowerCase(); // opaque hosts keep case → fold
  // P3d — WHATWG URL (Node 22, SA-verified) parses `vscode-webview://abc:9181` (no
  // throw); real webview Origins never carry a port → fail-closed deny keeps STC UT-15.
  if (scheme !== "http" && scheme !== "https" && url.port !== "") {
    return deny("malformed-origin", origin, host);
  }

  // ── Phase 4 — allowlist match (FR-03, BR-02 — no substring) ──────────────
  let matched = false;
  for (const pattern of ALLOWED_ORIGIN_PATTERNS) {
    if (pattern.scheme === scheme && (pattern.host === "*" || pattern.host === hostname)) {
      matched = true;
      break;
    }
  }
  if (!matched) return deny("origin-not-allowed", origin, host);

  // ── Phase 5 — Host required when an Origin is present (EF-1, FR-04) ──────
  if (host === "") return deny("host-mismatch", origin, host);
  // P5b..e already validated in Phase 1.5 (idempotent shared helper — I-8).

  // ── Phase 6 — pass (echo RAW trimmed Origin — G-4) ───────────────────────
  return { ok: true, echoOrigin: origin };
}
