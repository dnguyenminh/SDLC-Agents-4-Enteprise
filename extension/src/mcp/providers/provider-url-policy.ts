/**
 * SEC-324-01 — Provider baseUrl SSRF + API-key exfiltration guard.
 *
 * Reuses the tested backend policy (HTTPS-remote / loopback-HTTP / explicit
 * opt-in) so LLM provider URLs get the same protection as `backend.url`.
 * NOTE: import depth is ../../config (providers/ -> src/config), not
 * ../config as sketched in SECURITY-REVIEW.md snippet.
 */
import { validateBackendUrl, getAllowInsecureRemote } from "../../config/backend-url";

/**
 * Validate a provider base URL at construction time (fail-closed).
 * @throws when the URL uses a non-http(s) scheme, is a non-loopback
 * plain-HTTP URL without the explicit opt-in, or is malformed/empty.
 */
export function validateProviderBaseUrl(url: string): string {
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    throw new Error("[Security] Provider baseUrl must be a non-empty URL");
  }
  return validateBackendUrl(url, { allowInsecureRemote: readOptIn() });
}

/** Best-effort read of the shared opt-in flag; fail-closed on any error. */
function readOptIn(): boolean {
  try {
    return getAllowInsecureRemote() === true;
  } catch {
    return false;
  }
}
