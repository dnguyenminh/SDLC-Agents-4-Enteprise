// STC: TC-01 — PBT env-config validation: resolveE2EEnv throws EnvConfigError for any
// invalid E2E_IDE (UC-02 FSD 3.2 EF-1, BR-01, TDD §7.2).
//
// Properties (STC TC-01 test steps):
//   P1 — arbitrary strings NOT in VALID_IDES → EnvConfigError for EVERY invalid value;
//        the error message lists the valid enum
//   P2 — values inside VALID_IDES + an existing binary path (temp fixture file) →
//        resolveE2EEnv() returns a valid E2EEnv object; no throw
//   P3 — arbitrary non-existent paths for E2E_IDE_BINARY_PATH → EnvConfigError naming
//        the env var — fail fast (BR-01)
//
// fast-check reports a minimal counterexample on any failure (shrinking — STC step 4).
// Postconditions: no side effects — resolveE2EEnv is pure (reads process.env + fs only);
// process.env is saved/restored around every property run.
import { describe, it, expect, afterAll } from 'vitest';
import fc from 'fast-check';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveE2EEnv, EnvConfigError, type E2EEnv } from '../support/env';

const VALID_IDES = ['kiro', 'code', 'antigravity', 'kilo'];
const VALID_ENUM_MESSAGE = 'kiro | code | antigravity | kilo';

// Environment keys touched by resolveE2EEnv — saved and restored around each run.
const ENV_KEYS = [
    'E2E_IDE', 'E2E_IDE_BINARY_PATH', 'E2E_BASE_URL', 'E2E_HEADLESS',
    'E2E_FAIL_FAST', 'CI', 'DISPLAY',
] as const;

/** Runs `fn` with a clean, overridden environment; restores process.env afterwards. */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
    const saved: Record<string, string | undefined> = {};
    for (const key of ENV_KEYS) {
        saved[key] = process.env[key];
        delete process.env[key];
    }
    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) {
            process.env[key] = value;
        }
    }
    try {
        fn();
    } finally {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    }
}

/** Captures the error thrown by `run`, failing the test when no error is thrown. */
function catchEnvError(run: () => void): Error {
    try {
        run();
    } catch (error) {
        return error as Error;
    }
    throw new Error('Expected resolveE2EEnv to throw, but it returned normally');
}

describe('TC-01: resolveE2EEnv env-config validation (PBT — fast-check)', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'sa4e-341-env-'));
    const fixtureBinaryPath = join(fixtureDir, 'e2e-fake-ide.cmd');
    writeFileSync(fixtureBinaryPath, '@echo off');

    it('P1: throws EnvConfigError for every E2E_IDE value outside the valid enum (STC step 1)', () => {
        const invalidIdeArb = fc
            .string({ minLength: 0, maxLength: 30 })
            .filter((value) => !VALID_IDES.includes(value));

        fc.assert(
            fc.property(invalidIdeArb, (invalidIde) => {
                const error = catchEnvError(() => withEnv(
                    { E2E_IDE: invalidIde, E2E_IDE_BINARY_PATH: fixtureBinaryPath },
                    () => { resolveE2EEnv(); },
                ));
                expect(error).toBeInstanceOf(EnvConfigError);
                expect(error.message).toContain(VALID_ENUM_MESSAGE);
            }),
            { numRuns: 100 },
        );
    });

    it('P1: rejects the STC invalid E2E_IDE examples ("jetbrains", "", "vscode-fork", "CODE")', () => {
        for (const invalidIde of ['jetbrains', '', 'vscode-fork', 'CODE']) {
            const error = catchEnvError(() => withEnv(
                { E2E_IDE: invalidIde, E2E_IDE_BINARY_PATH: fixtureBinaryPath },
                () => { resolveE2EEnv(); },
            ));
            expect(error).toBeInstanceOf(EnvConfigError);
            expect(error.message).toContain(VALID_ENUM_MESSAGE);
        }
    });

    it('P2: returns a valid E2EEnv for every valid IDE with an existing binary path (STC step 2)', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...VALID_IDES),
                fc.boolean(),
                (ide, headless) => {
                    let result: E2EEnv | undefined;
                    withEnv(
                        {
                            E2E_IDE: ide,
                            E2E_IDE_BINARY_PATH: fixtureBinaryPath,
                            E2E_HEADLESS: String(headless),
                        },
                        () => { result = resolveE2EEnv(); },
                    );
                    expect(result).toBeDefined();
                    expect(result?.ide).toBe(ide);
                    expect(result?.ideBinaryPath).toBe(fixtureBinaryPath);
                    expect(result?.headless).toBe(headless);
                    expect(result?.workspacePath).toBeUndefined();
                },
            ),
            { numRuns: 50 },
        );
    });

    it('P3: throws EnvConfigError naming the env var for non-existent binary paths (STC step 3)', () => {
        const nonExistentPathArb = fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((value) => !value.includes('..') && !existsSync(join(fixtureDir, value)));

        fc.assert(
            fc.property(nonExistentPathArb, (nonExistentPath) => {
                const error = catchEnvError(() => withEnv(
                    { E2E_IDE: 'code', E2E_IDE_BINARY_PATH: join(fixtureDir, nonExistentPath) },
                    () => { resolveE2EEnv(); },
                ));
                expect(error).toBeInstanceOf(EnvConfigError);
                expect(error.message).toContain('E2E_IDE_BINARY_PATH');
                expect(error.message).toContain('BR-01');
            }),
            { numRuns: 100 },
        );
    });

    it('P3: rejects the STC non-existent path example ("Z:\\no-such-ide.exe") with fail fast', () => {
        const error = catchEnvError(() => withEnv(
            { E2E_IDE: 'code', E2E_IDE_BINARY_PATH: 'Z:\\no-such-ide.exe' },
            () => { resolveE2EEnv(); },
        ));
        expect(error).toBeInstanceOf(EnvConfigError);
        expect(error.message).toContain('E2E_IDE_BINARY_PATH');
        expect(error.message).toContain('BR-01');
    });

    it('P2: validates E2E_BASE_URL when provided — non-existent workspace fails fast', () => {
        const error = catchEnvError(() => withEnv(
            {
                E2E_IDE: 'code',
                E2E_IDE_BINARY_PATH: fixtureBinaryPath,
                E2E_BASE_URL: join(fixtureDir, 'no-such-workspace'),
            },
            () => { resolveE2EEnv(); },
        ));
        expect(error).toBeInstanceOf(EnvConfigError);
        expect(error.message).toContain('E2E_BASE_URL');
    });

    it('P2: accepts an existing E2E_BASE_URL workspace path', () => {
        let result: E2EEnv | undefined;
        withEnv(
            {
                E2E_IDE: 'kiro',
                E2E_IDE_BINARY_PATH: fixtureBinaryPath,
                E2E_BASE_URL: fixtureDir,
            },
            () => { result = resolveE2EEnv(); },
        );
        expect(result?.workspacePath).toBe(fixtureDir);
    });

    // cleanup the temp fixture (postcondition: no side effects — BR-05)
    afterAll(() => {
        rmSync(fixtureDir, { recursive: true, force: true });
    });
});
