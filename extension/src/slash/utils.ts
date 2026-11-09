/**
 * Shared utilities for the Impeccable design detection module.
 *
 * generateId — short random identifier used for run IDs and finding IDs
 * (report.generator.ts, per FSD §4.2 entity model).
 */

/**
 * Generate a random alphanumeric identifier of the requested length.
 *
 * @param length - Desired identifier length (default 8)
 * @returns Random id string, e.g. "a1b2c3d4"
 */
export function generateId(length: number = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
