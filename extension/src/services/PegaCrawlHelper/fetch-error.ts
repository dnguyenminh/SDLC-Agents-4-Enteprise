/**
 * Fetch error classification for Pega rule crawling (SA4E-92).
 */

/**
 * Classify a fetch error as "server" (abort-worthy) or "not_found" (skip).
 * Server errors indicate the Pega instance is unreachable or broken.
 */
export function classifyFetchError(errMsg: string): "server" | "not_found" | "other" {
    const lower = errMsg.toLowerCase();
    const isNotFound = lower.includes("not found")
        || lower.includes("rule not found")
        || lower.includes("record not found");
    if (isNotFound) { return "not_found"; }

    const serverPatterns = [
        "503", "502", "504", "500", "401", "403",
        "econnrefused", "enotfound", "etimedout",
        "fetch failed", "network error",
        "failed to connect", "service temporarily unavailable",
    ];
    const isServer = serverPatterns.some((p) => lower.includes(p));
    return isServer ? "server" : "other";
}
