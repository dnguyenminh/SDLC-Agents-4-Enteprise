// e2e/src/support/env.ts — env var schema + fail-fast validation (BR-01, TDD §7.2)
//
// Resolves and validates environment variables BEFORE the IDE launch (fail fast — BR-01).
// All machine-specific configuration is injected via env vars; nothing is hardcoded (BR-01, BR-02).
import { existsSync } from 'node:fs';

export class EnvConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EnvConfigError';
    }
}

export interface E2EEnv {
    ide: string;               // kiro | code | antigravity | kilo
    ideBinaryPath: string;     // must exist (BR-01)
    ideVersion?: string;       // E2E_IDE_VERSION — pin the VSCode version so the service
                               // resolves a MATCHING chromedriver (launcher.js resolves it
                               // from the 'stable' channel otherwise = latest, which breaks
                               // the session when the installed binary is older — SPIKE-4)
    workspacePath?: string;    // E2E_BASE_URL — must exist if provided
    headless: boolean;
    ci: boolean;               // drives logLevel info (FSD 5.2)
    failFast: boolean;
}

const VALID_IDES = ['kiro', 'code', 'antigravity', 'kilo'];

export function resolveE2EEnv(): E2EEnv {
    const ide = process.env.E2E_IDE;
    if (!ide || !VALID_IDES.includes(ide)) {
        throw new EnvConfigError(
            `E2E_IDE must be one of: ${VALID_IDES.join(' | ')} (got "${ide ?? 'undefined'}"). ` +
            `Setup: set E2E_IDE and E2E_IDE_BINARY_PATH before running (BR-01).`,
        );
    }
    const ideBinaryPath = process.env.E2E_IDE_BINARY_PATH ?? '';
    if (!ideBinaryPath || !existsSync(ideBinaryPath)) {
        throw new EnvConfigError(
            `E2E_IDE_BINARY_PATH does not exist: "${ideBinaryPath}". ` +
            `Run aborts before IDE launch (BR-01). Set the path to the IDE executable.`,
        );
    }
    const workspacePath = process.env.E2E_BASE_URL;
    if (workspacePath && !existsSync(workspacePath)) {
        throw new EnvConfigError(`E2E_BASE_URL does not exist: "${workspacePath}" (BR-01).`);
    }
    return {
        ide,
        ideBinaryPath,
        ideVersion: process.env.E2E_IDE_VERSION || undefined,
        workspacePath,
        headless: process.env.E2E_HEADLESS === 'true',
        ci: process.env.CI === 'true' || Boolean(process.env.DISPLAY),
        failFast: process.env.E2E_FAIL_FAST === 'true',
    };
}
