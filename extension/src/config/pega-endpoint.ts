/**
 * SA4E-323 SEC-02 — HTTPS enforcement for the Pega endpoint.
 *
 * `getPegaEndpoint()` used to return the raw configured URL, so a plaintext
 * `http://` (or attacker-supplied) endpoint would receive the victim's Pega
 * Basic-auth credentials. This module gates that: HTTP is allowed only for
 * genuine loopback hosts (local dev); any non-loopback `http://` endpoint is
 * rejected unless the operator explicitly opts in via
 * `kiroSdlc.backend.allowInsecureRemote`. It deliberately reuses the same
 * `isLoopbackHost` predicate and opt-in flag as backend-url validation so the
 * extension has one consistent transport-security policy (DRY).
 */
import { isLoopbackHost, getAllowInsecureRemote } from "./backend-url";

/**
 * Enforce HTTPS for a non-loopback Pega endpoint before credentials are sent.
 *
 * - `https://…`                         → returned unchanged.
 * - `http://` loopback (localhost/127.*) → allowed (local development).
 * - `http://` remote + opt-in ON         → allowed, logs a MITM warning.
 * - `http://` remote + opt-in OFF        → rejected (fail-closed).
 * - non http/https protocols             → rejected.
 *
 * @param endpoint Configured Pega endpoint (trailing slash already stripped).
 * @returns The same endpoint when the policy permits it.
 * @throws Error (prefixed `[Security]`) when the endpoint is not permitted.
 */
export function enforcePegaEndpointHttps(endpoint: string): string {
  const parsed = parseEndpoint(endpoint);
  if (parsed.protocol === "https:") {
    return endpoint;
  }
  if (parsed.protocol === "http:") {
    checkHttpAllowed(parsed.hostname);
    return endpoint;
  }
  const msg = `[Security] Invalid Pega endpoint protocol "${parsed.protocol}". Only HTTP (loopback) and HTTPS are allowed.`;
  console.warn(msg);
  throw new Error(msg);
}

/** Parse the endpoint, converting URL parse failures into a [Security] error. */
function parseEndpoint(endpoint: string): URL {
  try {
    return new URL(endpoint);
  } catch {
    const msg = `[Security] Malformed Pega endpoint URL: "${endpoint}"`;
    console.warn(msg);
    throw new Error(msg);
  }
}

/** Allow http only for loopback, or for remote hosts with an explicit opt-in. */
function checkHttpAllowed(hostname: string): void {
  if (isLoopbackHost(hostname)) {
    return;
  }
  if (getAllowInsecureRemote()) {
    console.warn(
      `[Security] WARNING: Insecure remote Pega endpoint allowed (allowInsecureRemote=true) — traffic to "${hostname}" is unencrypted HTTP. ` +
      `Basic-auth credentials can be intercepted (MITM). Only use on trusted private networks.`
    );
    return;
  }
  const msg = `[Security] Insecure Pega endpoint rejected: HTTP is only allowed for loopback addresses (localhost, 127.0.0.1). Use HTTPS for remote host "${hostname}".`;
  console.warn(msg);
  throw new Error(msg);
}
