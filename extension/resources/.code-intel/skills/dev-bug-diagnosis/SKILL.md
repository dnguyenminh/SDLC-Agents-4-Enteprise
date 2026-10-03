---
name: dev-bug-diagnosis
description: 6-phase diagnosis loop for bug fixing — reproduce first, then fix
---

## Purpose

When DEV agent is in **bug fix mode** (Jira type = Bug, or SM sends "Fix bugs" instruction), DEV MUST follow this diagnosis loop instead of guessing fixes.

## Core Rule

> **"No red-capable command, no fix attempt."**
>
> DEV CANNOT attempt a fix unless they have a failing test that reproduces the bug.
> Guessing fixes without reproduction = FORBIDDEN.

## Trigger Conditions

- Jira ticket type = Bug
- SM invokes with "Fix bugs" transition
- QA reports a test failure needing root-cause investigation

## 6-Phase Diagnosis Loop

### Phase 1: Build Feedback Loop
**Goal:** Get to a state where you can run code and see output.
1. Verify build: `npm run build` (or equivalent)
2. Verify tests run: `npm test` (Vitest)
3. If build broken → fix compilation first (this is NOT the bug fix)
4. Confirm: "Build succeeds, N tests pass, ready to diagnose."
**Exit criteria:** Build green, tests runnable.

### Phase 2: Reproduce
**Goal:** Create a FAILING test that demonstrates the bug.
1. Read bug description from Jira (symptoms, steps to reproduce, expected vs actual)
2. Read relevant source code to understand the code path
3. Write a test that sets up the preconditions, executes the buggy action, and asserts EXPECTED behavior (which will FAIL because of the bug)
4. Run it — confirm it FAILS with the described symptom
5. If it passes → bug may already be fixed or reproduction is wrong → re-read bug report

```typescript
// Bug: "empty name accepted when it shouldn't be"
it('should reject empty provider name', async () => {
  // ARRANGE: preconditions from bug report
  const request: CreateProviderRequest = { name: "", transport: "stdio" };
  // ACT: trigger the buggy behavior
  const response = await client.post("/api/providers", request);
  // ASSERT: expected correct behavior (should FAIL currently)
  expect(response.status).toBe(400);
  expect(response.body).toContain("name must not be empty");
});
```

**Exit criteria:** At least one test FAILS demonstrating the bug.
**BLOCKED if** cannot reproduce → report to SM: "Bug cannot be reproduced with given information. Need more details."

### Phase 3: Hypothesise
**Goal:** Form a specific, testable hypothesis about the root cause.
1. Read the failing test's stack trace / error output
2. Trace the code path from entry point to failure point
3. Identify the specific line(s) where behavior diverges from expectation
4. Write the hypothesis as a comment:
```typescript
// HYPOTHESIS: ValidationService.validateName() does not check for empty strings,
// only checks for null. Line 42 of ValidationService.ts.
```

**Rules:** hypothesis must be SPECIFIC (file, line, condition), TESTABLE, max 3 before seeking help.
**Exit criteria:** Written hypothesis pointing to a specific code location.

### Phase 4: Instrument
**Goal:** Verify the hypothesis with targeted observation.
1. Add minimal instrumentation: log statement at the suspected location, assertion in the suspected method, or a targeted test with debug output
2. Run the failing test with instrumentation
3. Confirm or reject hypothesis based on observed output

```typescript
function validateName(name: string | null): ValidationResult {
  // INSTRUMENT: verify this is reached with empty string
  console.log(`[BUG-DIAG] validateName called with: '${name}', isEmpty=${name?.length === 0}`);
  if (name == null) return ValidationResult.invalid("name is required");
  // ← CONFIRMED: empty string passes this check!
  return ValidationResult.valid();
}
```

If CONFIRMED → Phase 5. If REJECTED → Phase 3 with a new hypothesis (max 3 total).
**Exit criteria:** Root cause confirmed via observation.

### Phase 5: Fix
**Goal:** Apply the minimal fix that makes the failing test pass.
1. Apply the SMALLEST change that fixes the root cause
2. Run the reproduction test → should now PASS
3. Run ALL existing tests → should still PASS (no regressions)
4. Remove instrumentation code from Phase 4

```typescript
// FIX: add empty string check
function validateName(name: string | null): ValidationResult {
  if (name == null || name.trim().length === 0) {
    return ValidationResult.invalid("name must not be empty");
  }
  return ValidationResult.valid();
}
```

**Rules:** fix MINIMAL (no unrelated refactoring), reproduction test PASSES, no existing test broken, change >~20 lines → discuss with SA/SM first.
**Exit criteria:** Reproduction test passes, all other tests pass.

### Phase 6: Cleanup
**Goal:** Ensure the fix is production-ready.
1. Remove ALL debug/instrumentation code
2. Name and document the reproduction test properly:
   ```typescript
   it('BUG-{TICKET}: should reject empty provider name', () => { ... });
   ```
3. Run the full test suite one final time
4. Check code standards (file ≤200 lines, function ≤20 lines)
5. Commit with message: `{TICKET}: fix {description} — root cause: {1-line explanation}`
**Exit criteria:** Clean commit, all tests green, no debug code.

## Reporting Format

After completing the loop, DEV reports to SM:
```
## Bug Fix Report — {TICKET}

**Root Cause:** {specific explanation}
**File(s) Changed:** {list}
**Reproduction Test:** {test name and location}
**Fix:** {1-2 sentence description}
**Regression:** All {N} existing tests still pass
**Commit:** {hash} — {message}
```

## Failure Modes & Escalation

| Situation | Action |
|-----------|--------|
| Cannot reproduce (Phase 2 stuck) | Report to SM: "Need more info from reporter" |
| 3 hypotheses all rejected (Phase 3-4) | Report to SM: "Root cause unclear, need SA review" |
| Fix breaks other tests (Phase 5) | Report to SM: "Fix has side effects, need design discussion" |
| Fix requires >50 lines change | Report to SM: "Significant refactoring needed, upgrade to Story?" |

## Anti-Patterns (FORBIDDEN)

| Anti-Pattern | Why Bad | Correct Approach |
|--------------|---------|------------------|
| "Try this fix and see if it works" | Guess-and-check wastes time | Write failing test FIRST |
| Fix without reproduction test | No proof bug existed or is fixed | ALWAYS Phase 2 before Phase 5 |
| Shotgun fix (change many things) | Can't identify which change helped | Minimal, targeted fix only |
| "It works on my machine" | No automated verification | Reproduction test proves it |
| Skip cleanup (leave debug code) | Pollutes production code | ALWAYS Phase 6 |
| Fix bug + refactor in same commit | Muddles history, hard to revert | Separate commits |

## Integration with SM Pipeline

- SM detects bug fix mode from Jira ticket type or transition
- SM invokes DEV with: "Fix bug {TICKET}. Follow dev-bug-diagnosis loop."
- DEV reports back with Bug Fix Report
- SM verifies: reproduction test exists + all tests green
- SM transitions Jira accordingly