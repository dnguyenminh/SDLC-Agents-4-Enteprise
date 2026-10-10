// vitest.config.ts — UT/PBT unit tests for the e2e framework (no IDE required).
// A dedicated config keeps vitest from walking up to the repo-root vitest.config.ts
// (whose include patterns target backend/extension sources, not e2e/ tests).
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/__tests__/**/*.test.ts'],
        environment: 'node',
        globals: false,
    },
});
