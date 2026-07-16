/**
 * SA4E-42 (F-03) — bounded, allowlisted error rendering for logs.
 * Returns the message only (never a raw object/stack), capped at 500 chars,
 * with control characters stripped to prevent log injection (CWE-117).
 */
export function safeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/[\r\n\t\u0000-\u001f]+/g, ' ').slice(0, 500);
}
