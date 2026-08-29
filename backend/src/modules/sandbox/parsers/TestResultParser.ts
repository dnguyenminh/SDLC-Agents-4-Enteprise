/**
 * SA4E-6 — TestResultParser: converts raw executor output into a structured TestResult.
 * Supports vitest/jest/pytest/gradle/mocha with graceful fallback to raw output.
 */

import type { ExecutionResult, TestResult, TestFailure, CoverageSummary } from '../models.js';

type Framework = 'vitest' | 'jest' | 'pytest' | 'gradle' | 'mocha';

interface Parsed {
  status: 'success' | 'failure' | 'error';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: TestFailure[];
  coverage?: CoverageSummary;
}

function extractNumbers(line: string): number[] {
  return (line.match(/\d+/g) ?? []).map(Number);
}

function parseVitestJest(text: string): Parsed {
  // Vitest/Jest print a summary line that starts with "Tests" (e.g.
  // "Tests  1 failed | 4 passed | 5 total" for vitest, or "Tests: 3 passed, 3 total" for jest).
  // We must target THAT line rather than the "Test Files" line, because a whole-text scan with
  // "/(\d+)\s+total/" would otherwise match "Test Files ... 3 total" first and miscount the run.
  const lines = text.split('\n');
  const testsLine = lines.find((l) => /^\s*Tests\b/.test(l)) ?? text;
  const failed = /(\d+)\s+failed/.exec(testsLine);
  const passed = /(\d+)\s+passed/.exec(testsLine);
  const total = /(\d+)\s+total/.exec(testsLine);
  const skipped = /(\d+)\s+skipped/.exec(testsLine);
  const f = failed ? Number(failed[1]) : 0;
  const p = passed ? Number(passed[1]) : 0;
  const t = total ? Number(total[1]) : p + f + (skipped ? Number(skipped[1]) : 0);
  const s = skipped ? Number(skipped[1]) : 0;
  const failures = parseFailures(text);
  const coverage = parseCoverage(text);
  return {
    status: f > 0 ? 'failure' : 'success',
    total: t,
    passed: p,
    failed: f,
    skipped: s,
    failures,
    coverage,
  };
}

function parseFailures(text: string): TestFailure[] {
  const failures: TestFailure[] = [];
  // Vitest/Jest style: "✓/× name" or "FAIL name" lines followed by message.
  const re = /(?:❯|×|✗|FAIL)\s+(.+?)(?:\s+›|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    failures.push({ test: m[1].trim(), message: 'see output' });
  }
  // Pytest style: "FAILED path::test_name - message"
  const pyRe = /FAILED\s+(\S+?)\s+-\s+(.+)/g;
  while ((m = pyRe.exec(text)) !== null) {
    failures.push({ test: m[1].trim(), message: m[2].trim() });
  }
  return failures.slice(0, 50);
}

function parseCoverage(text: string): CoverageSummary | undefined {
  // Looking for "All files ... 85.2 72.1 90.0 84.8" (vitest/jest) or "TOTAL 85 72 90 84" (pytest).
  const lines = text.split('\n');
  for (const line of lines) {
    if (/all files/i.test(line) || /TOTAL/i.test(line)) {
      const nums = extractNumbers(line);
      if (nums.length >= 4) {
        return { statements: nums[0], branches: nums[1], functions: nums[2], lines: nums[3] };
      }
    }
  }
  return undefined;
}

function parsePytest(text: string): Parsed {
  const failedMatch = /(\d+)\s+failed/.exec(text);
  const passedMatch = /(\d+)\s+passed/.exec(text);
  const errorMatch = /(\d+)\s+error/.exec(text);
  const skippedMatch = /(\d+)\s+skipped/.exec(text);
  const f = failedMatch ? Number(failedMatch[1]) : 0;
  const p = passedMatch ? Number(passedMatch[1]) : 0;
  const e = errorMatch ? Number(errorMatch[1]) : 0;
  const s = skippedMatch ? Number(skippedMatch[1]) : 0;
  const total = p + f + e + s;
  const failures = parseFailures(text);
  const coverage = parseCoverage(text);
  return {
    status: f > 0 || e > 0 ? 'failure' : 'success',
    total,
    passed: p,
    failed: f + e,
    skipped: s,
    failures,
    coverage,
  };
}

function parseMocha(text: string): Parsed {
  const passing = /(\d+)\s+passing/.exec(text);
  const failing = /(\d+)\s+failing/.exec(text);
  const pending = /(\d+)\s+pending/.exec(text);
  const p = passing ? Number(passing[1]) : 0;
  const f = failing ? Number(failing[1]) : 0;
  const s = pending ? Number(pending[1]) : 0;
  const failures = parseFailures(text);
  return {
    status: f > 0 ? 'failure' : 'success',
    total: p + f + s,
    passed: p,
    failed: f,
    skipped: s,
    failures,
  };
}

function parseGradle(text: string): Parsed {
  // "Tests run: 15, Failures: 2, Errors: 0, Skipped: 1"
  const run = /Tests run:\s*(\d+)/.exec(text);
  const failures = /Failures:\s*(\d+)/.exec(text);
  const errors = /Errors:\s*(\d+)/.exec(text);
  const skipped = /Skipped:\s*(\d+)/.exec(text);
  const t = run ? Number(run[1]) : 0;
  const f = (failures ? Number(failures[1]) : 0) + (errors ? Number(errors[1]) : 0);
  const s = skipped ? Number(skipped[1]) : 0;
  const p = Math.max(0, t - f - s);
  const failureList = parseFailures(text);
  return {
    status: f > 0 ? 'failure' : 'success',
    total: t,
    passed: p,
    failed: f,
    skipped: s,
    failures: failureList,
  };
}

export function parseTestResult(framework: string, result: ExecutionResult): TestResult {
  const text = `${result.stdout}\n${result.stderr}`;
  let parsed: Parsed;
  switch (framework as Framework) {
    case 'vitest':
    case 'jest':
      parsed = parseVitestJest(text);
      break;
    case 'pytest':
      parsed = parsePytest(text);
      break;
    case 'mocha':
      parsed = parseMocha(text);
      break;
    case 'gradle':
      parsed = parseGradle(text);
      break;
    default:
      parsed = { status: 'error', total: 0, passed: 0, failed: 0, skipped: 0, failures: [] };
  }

  // If output could not be parsed but process succeeded, report success with totals 0.
  if (parsed.total === 0 && parsed.failed === 0 && result.exitCode === 0 && parsed.failures.length === 0) {
    parsed.status = 'success';
  } else if (result.exitCode !== 0 && parsed.failed === 0 && parsed.status !== 'error') {
    parsed.status = 'failure';
  }

  return {
    ...result,
    status: parsed.status,
    total: parsed.total,
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    failures: parsed.failures,
    coverage: parsed.coverage,
    rawOutput: text,
  };
}
