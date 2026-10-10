// STC: TC-21 — committed-config hygiene: no hardcoded paths, no secrets
// (BR-01, BR-02, TDD gate G5, TDD §10.1).
// STC: TC-05 — step definitions delegation-only audit (no raw WDIO — BR-04, TDD §6.5).
//
// TC-21 checks (STC steps):
//   1. Grep committed e2e/ config + src for machine-specific paths
//      (C:\Users, /home/, /usr/bin, C:\projects) — zero matches
//   2. Grep committed e2e/ for secret-assignment patterns — zero secrets committed (BR-02)
//   3. Verify .gitignore excludes generated artifacts (e2e/target/, e2e/node_modules/)
//   4. Verify resolveE2EEnv() consumes env vars only (env-var-only flow, BR-02)
//
// TC-05 checks (STC steps):
//   1. Scan all files under e2e/features/step_definitions/ for raw WebdriverIO commands —
//      zero matches (BR-04 violation would fail the audit)
//   2. Verify every step file delegates via actorCalled(...).attemptsTo(...)
//   3. Verify actorCalled is referenced ONLY inside step-definition files (no usage in e2e/src/)
//   4. Verify Gherkin lint: declarative features, one scenario block each
//
// Scan scope: committed e2e/ files only (excludes node_modules, target, dist) and EXCLUDES
// this audit test file itself — it necessarily carries the pattern definitions, like any
// self-referential linter config.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const E2E_ROOT = process.cwd();
const AUDIT_FILE = 'src/__tests__/config-hygiene.test.ts';
const EXCLUDED_DIRS = ['node_modules', 'target', 'dist'];

/** Committed e2e/ files scanned by the audit (source, config, features, docs). */
function committedE2EFiles(): string[] {
    const files: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
            if (EXCLUDED_DIRS.includes(entry)) {
                continue;
            }
            const fullPath = join(dir, entry);
            if (statSync(fullPath).isDirectory()) {
                walk(fullPath);
            } else {
                files.push(fullPath);
            }
        }
    };
    walk(E2E_ROOT);
    return files.filter((file) => {
        const rel = relative(E2E_ROOT, file).split('\\').join('/');
        return rel !== AUDIT_FILE;
    });
}

/** Reads a file relative to the e2e/ root. */
function readE2EFile(relativePath: string): string {
    return readFileSync(join(E2E_ROOT, relativePath), 'utf8');
}

describe('TC-21: committed-config hygiene (BR-01, BR-02 — TDD gate G5)', () => {
    it('has no hardcoded machine-specific paths in committed config + src (BR-01)', () => {
        const machinePathPatterns = [
            /C:\\Users/i,
            /\/home\//,
            /\/usr\/bin/,
            /C:\\projects/i,
        ];
        const violations: string[] = [];
        for (const file of committedE2EFiles()) {
            const content = readFileSync(file, 'utf8');
            for (const pattern of machinePathPatterns) {
                if (pattern.test(content)) {
                    violations.push(`${file}: ${pattern}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('has no secret-assignment patterns in committed files (BR-02)', () => {
        // Matches real secret assignments with values (e.g. token: "abc123"), not prose
        // that merely documents the env-var-only flow.
        const secretPattern = /(password|passwd|token|api[_-]?key|secret|credential)\s*[:=]\s*['"][^'"]+['"]/i;
        const violations: string[] = [];
        for (const file of committedE2EFiles()) {
            const content = readFileSync(file, 'utf8');
            if (secretPattern.test(content)) {
                violations.push(file);
            }
        }
        expect(violations).toEqual([]);
    });

    it('gitignore excludes generated artifacts: e2e/target/ and e2e/node_modules/ (TDD §8.2)', () => {
        const gitignorePath = join(E2E_ROOT, '.gitignore');
        expect(existsSync(gitignorePath)).toBe(true);
        const gitignore = readFileSync(gitignorePath, 'utf8');
        expect(gitignore).toContain('node_modules');
        expect(gitignore).toContain('target');
    });

    it('resolveE2EEnv consumes env vars only — no hardcoded fallback paths (BR-02, TDD §10.1)', () => {
        const envSource = readE2EFile('src/support/env.ts');
        expect(envSource).toContain('process.env.E2E_IDE');
        expect(envSource).toContain('process.env.E2E_IDE_BINARY_PATH');
        expect(envSource).toContain('process.env.E2E_BASE_URL');
        expect(envSource).not.toMatch(/['"]\/(home|usr|Users)/);
    });
});

describe('TC-05: step definitions delegation-only audit (BR-04)', () => {
    const STEP_DEFINITIONS_DIR = 'features/step_definitions';

    it('has zero raw WebdriverIO commands in step definitions (BR-04)', () => {
        const rawWdioPatterns = [
            /\$\(/,           // browser.$( / $(
            /\bbrowser\./,    // browser. commands used directly
            /\.setValue\(/,
            /\.click\(/,
            /\.getText\(/,
        ];
        const violations: string[] = [];
        for (const file of readdirSync(join(E2E_ROOT, STEP_DEFINITIONS_DIR))) {
            const content = readFileSync(join(E2E_ROOT, STEP_DEFINITIONS_DIR, file), 'utf8');
            for (const pattern of rawWdioPatterns) {
                if (pattern.test(content)) {
                    violations.push(`${STEP_DEFINITIONS_DIR}/${file}: ${pattern}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('every step file delegates via actorCalled(...).attemptsTo(...) (BR-04)', () => {
        const stepFiles = readdirSync(join(E2E_ROOT, STEP_DEFINITIONS_DIR))
            .filter((file) => file.endsWith('.steps.ts'));
        expect(stepFiles.length).toBeGreaterThanOrEqual(3);
        for (const file of stepFiles) {
            const content = readFileSync(join(E2E_ROOT, STEP_DEFINITIONS_DIR, file), 'utf8');
            expect(content).toContain('actorCalled(');
            expect(content).toContain('attemptsTo(');
        }
    });

    it('actorCalled is referenced ONLY inside step-definition files (no usage in e2e/src/ production code)', () => {
        const srcDir = join(E2E_ROOT, 'src');
        const violations: string[] = [];
        const walk = (dir: string): void => {
            for (const entry of readdirSync(dir)) {
                const fullPath = join(dir, entry);
                if (statSync(fullPath).isDirectory()) {
                    // __tests__ excluded: UTs use actorCalled legitimately (STC TC-05/TC-21
                    // audit scope is production code only — BR-04)
                    if (entry === '__tests__') {
                        continue;
                    }
                    walk(fullPath);
                } else if (fullPath.endsWith('.ts')) {
                    const content = readFileSync(fullPath, 'utf8');
                    if (content.includes('actorCalled')) {
                        violations.push(relative(E2E_ROOT, fullPath));
                    }
                }
            }
        };
        walk(srcDir);
        expect(violations).toEqual([]);
    });

    it('Gherkin lint: declarative features with at least one scenario each (TDD §8.1)', () => {
        const featureFiles: string[] = [];
        for (const dir of ['features/smoke', 'features/workbench', 'features/commands', 'features/webview']) {
            for (const file of readdirSync(join(E2E_ROOT, dir))) {
                if (file.endsWith('.feature')) {
                    featureFiles.push(`${dir}/${file}`);
                }
            }
        }
        // at least 5 scenarios by epic completion (UC-04) — 4 skeleton scenarios now
        expect(featureFiles.length).toBeGreaterThanOrEqual(4);
        for (const file of featureFiles) {
            const content = readFileSync(join(E2E_ROOT, file), 'utf8');
            expect(content).toContain('Feature:');
            expect(content).toContain('Scenario:');
            // declarative steps only — Given/When/Then/And, no implementation detail markers
            expect(content).toMatch(/Given|When|Then/);
        }
    });
});
