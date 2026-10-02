/**
 * SA4E-336 — test helper: mock process.platform for OS-aware behavior (TDD §11.4).
 */

/**
 * Override process.platform for the duration of a test.
 * @param platform value to report (e.g. 'win32' | 'linux' | 'darwin')
 * @returns restore function — call it to put the real platform back
 */
export function mockPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return () => Object.defineProperty(process, 'platform', { value: original, configurable: true });
}
