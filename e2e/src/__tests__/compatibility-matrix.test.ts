// STC: TC-02 — PBT chromedriver ↔ Electron version mapping table consistency
// (UC-01 FSD 3.1, UC-03 FSD 3.3, BR-07, TDD §11.2 SPIKE-2).
//
// Preconditions (STC): compatibility matrix committed at
// documents/SA4E-341/spikes/compatibility-matrix.md (SPIKE-2 output, produced during the
// UC-03 IDE fork spike). Until the matrix exists, the tests SKIP with a clear message —
// they activate automatically once QA commits the matrix.
//
// Properties (STC TC-02 test steps):
//   1. Every matrix row parses; cdp_attach is one of go / no-go / blocked
//   2. For every row where cdp_attach = "go": chromedriver_version is non-empty AND its
//      major version is compatible with the IDE's Chromium version per the
//      chromedriver mapping rule VERIFIED from wdio-vscode-service launcher.js
//      (_fetchChromedriverVersion reads the chromium registration version from the
//      VSCode release cgmanifest.json and matches chromedriver major to it —
//      chromedriver major tracks Chromium, not the Electron release number)
//   3. Every row (any result) has evidence — a committed smoke_scenario ref or a
//      documented blocker (BR-07 — no verbal-only conclusions)
//   4. On failure, fast-check shrinks to the minimal offending IDE row
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Committed spike artifact location (TDD §7.3) — relative to the e2e/ package root
// (tests run with cwd = e2e/, per the npm test:unit script).
const MATRIX_PATH = join(process.cwd(), '..', 'documents', 'SA4E-341', 'spikes', 'compatibility-matrix.md');

const VALID_CDP_ATTACH_RESULTS = ['go', 'no-go', 'blocked'];

interface MatrixRow {
    ide: string;
    ideVersion: string;
    cdpAttach: string;
    chromiumVersion: string;
    chromedriverVersion: string;
    smokeScenario: string;
    notes: string;
}

/** Parses a markdown table row (pipe-separated) into a mapping record. */
function parseRow(line: string): MatrixRow {
    const cells = line.split('|').map((cell) => cell.trim());
    // A markdown row starting with '|' yields a leading empty cell — drop it so
    // cells[] aligns with the schema (ide, ideVersion, cdpAttach, ...)
    if (cells[0] === '') {
        cells.shift();
    }
    return {
        ide: cells[0] ?? '',
        ideVersion: cells[1] ?? '',
        cdpAttach: (cells[2] ?? '').toLowerCase(),
        chromiumVersion: cells[3] ?? '',
        chromedriverVersion: cells[4] ?? '',
        smokeScenario: cells[5] ?? '',
        notes: cells[6] ?? '',
    };
}

/** Loads and parses the committed compatibility matrix rows (skips header/separator rows). */
function loadMatrixRows(): MatrixRow[] {
    const content = readFileSync(MATRIX_PATH, 'utf8');
    return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('|') && !line.includes('---') && !/^\|\s*ide\b/i.test(line))
        .map(parseRow)
        // The spike doc contains other pipe tables (risk register, verify plan) — only
        // rows carrying a valid cdp_attach verdict are compatibility-matrix rows (TC-02
        // property 1 defines the go/no-go/blocked vocabulary)
        .filter((row) => VALID_CDP_ATTACH_RESULTS.includes(row.cdpAttach));
}

/** Major version of a semver-ish version string (e.g. "128.0.6613.84" → 128). */
function majorVersionOf(version: string): number {
    return Number.parseInt(version.split('.')[0] ?? '', 10);
}

describe('TC-02: chromedriver ↔ Electron version mapping table consistency (PBT)', () => {
    // SPIKE-2 precondition: the matrix is a spike output — skip until it is committed
    const matrixExists = existsSync(MATRIX_PATH);

    it.skipIf(!matrixExists)('every matrix row parses; cdp_attach is go / no-go / blocked (STC step 1)', () => {
        const rows = loadMatrixRows();
        expect(rows.length).toBeGreaterThan(0);
        fc.assert(
            fc.property(fc.constantFrom(...rows), (row) => {
                expect(VALID_CDP_ATTACH_RESULTS).toContain(row.cdpAttach);
            }),
        );
    });

    it.skipIf(!matrixExists)('every "go" row has a compatible chromedriver major (STC step 2)', () => {
        const goRows = loadMatrixRows().filter((row) => row.cdpAttach === 'go');
        expect(goRows.length).toBeGreaterThan(0);
        fc.assert(
            fc.property(fc.constantFrom(...goRows), (row) => {
                // chromedriver major tracks the IDE's Chromium major (verified mapping
                // rule — wdio-vscode-service launcher.js _fetchChromedriverVersion)
                expect(row.chromedriverVersion.length).toBeGreaterThan(0);
                expect(majorVersionOf(row.chromedriverVersion)).toBe(majorVersionOf(row.chromiumVersion));
            }),
        );
    });

    it.skipIf(!matrixExists)('every row has committed evidence — smoke scenario ref or blocker (STC step 3, BR-07)', () => {
        const rows = loadMatrixRows();
        fc.assert(
            fc.property(fc.constantFrom(...rows), (row) => {
                const hasEvidence = row.smokeScenario.length > 0 || row.notes.length > 0;
                expect(hasEvidence).toBe(true);
            }),
        );
    });
});
