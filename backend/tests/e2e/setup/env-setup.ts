/**
 * E2E per-file setup — ensures env vars are set for test code.
 * The globalSetup handles server lifecycle; this just provides env context.
 */

if (!process.env.ADMIN_INITIAL_PASSWORD) {
  process.env.ADMIN_INITIAL_PASSWORD = 'test-admin-pw-01';
}
