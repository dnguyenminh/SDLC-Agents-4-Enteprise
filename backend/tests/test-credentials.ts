/**
 * Shared admin credentials for tests.
 * The password is sourced from ADMIN_INITIAL_PASSWORD (set by vitest.setup.ts),
 * so tests never hardcode the old admin/admin default (vuln-0001).
 */
export const TEST_ADMIN_USERNAME = 'admin';
export const TEST_ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'test-admin-pw-01';
