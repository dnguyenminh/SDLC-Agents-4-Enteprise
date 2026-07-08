# DEV Bug Diagnosis Loop

## Purpose

When DEV agent is in **bug fix mode** (Jira type = Bug, or SM sends "Fix bugs" instruction), DEV MUST follow this structured diagnosis loop instead of guessing fixes.

## Core Rule

> **"No red-capable command, no fix attempt."**
>
> DEV CANNOT attempt a fix unless they have a failing test that reproduces the bug.
> Guessing fixes without reproduction = FORBIDDEN.

## Trigger Conditions

DEV enters bug diagnosis mode when:
- Jira ticket type = Bug
- SM invokes with "Fix bugs" transition
- QA reports test failure that needs root-cause investigation
- SM invokes after "Fix bugs" Jira transition

## 6-Phase Diagnosis Loop

### Phase 1: Build Feedback Loop

**Goal:** Get the system into a state where you can run code and see output.

1. Verify project builds: `./gradlew build` (or equivalent)
2. Verify existing tests run: `./gradlew test`
3. If build broken → fix compilation first (this is NOT the bug fix)
4. Confirm: "Build succeeds, N tests pass, ready to diagnose."

**Exit criteria:** Build green, tests runnable.

### Phase 2: Reproduce

**Goal:** Create a FAILING test that demonstrates the bug.

1. Read bug description from Jira (symptoms, steps to reproduce, expected vs actual)
2. Read relevant source code to understand the code path
3. Write a test that:
   - Sets up the preconditions described in the bug
   - Executes the action that triggers the bug
   - Asserts the EXPECTED behavior (which will FAIL because of the bug)
4. Run the test — confirm it FAILS with the described symptom
5. If test passes → bug may be already fixed or reproduction is wrong → re-read bug report

```kotlin
// Example: Bug says "empty name accepted when it shouldn't be"
@Test
fun `should reject empty provider name`() {
    // ARRANGE: preconditions from bug report
    val request = CreateProviderRequest(name = "", transport = "stdio")

    // ACT: trigger the buggy behavior
    val response = client.post("/api/providers", request)

    // ASSERT: expected correct behavior (this should FAIL currently)
    assertEquals(400, response.status)
    assertContains(response.body, "name must not be empty")
}
```

**Exit criteria:** At least one test FAILS demonstrating the bug.

**⛔ BLOCKED if:** Cannot reproduce → report to SM: "Bug cannot be reproduced with given information. Need more details."

### Phase 3: Hypothesise

**Goal:** Form a specific, testable hypothesis about the root cause.

1. Read the failing test's stack trace / error output
2. Trace the code path from entry point to failure point
3. Identify the specific line(s) where behavior diverges from expectation
4. Write the hypothesis in a comment:

```kotlin
// HYPOTHESIS: ValidationService.validateName() does not check for empty strings,
// only checks for null. Line 42 of ValidationService.kt.
```

**Rules:**
- Hypothesis must be SPECIFIC (file, line, condition)
- Hypothesis must be TESTABLE (you can verify it)
- Maximum 3 hypotheses before seeking help

**Exit criteria:** Written hypothesis pointing to specific code location.

### Phase 4: Instrument

**Goal:** Verify the hypothesis with targeted observation.

1. Add minimal instrumentation to confirm hypothesis:
   - Add a log statement at the suspected location
   - Add an assertion in the suspected method
   - Add a breakpoint-equivalent (targeted test with debug output)
2. Run the failing test with instrumentation
3. Confirm or reject hypothesis based on observed output

```kotlin
// Instrumentation: Add temporary assertion
fun validateName(name: String?): ValidationResult {
    // INSTRUMENT: Verify this is reached with empty string
    println("[BUG-DIAG] validateName called with: '$name', isEmpty=${name?.isEmpty()}")

    if (name == null) return ValidationResult.invalid("name is required")
    // ← CONFIRMED: empty string passes this check!
    return ValidationResult.valid()
}
```

**If hypothesis CONFIRMED:** Proceed to Phase 5.
**If hypothesis REJECTED:** Return to Phase 3 with new hypothesis (max 3 total).

**Exit criteria:** Root cause confirmed via observation.

### Phase 5: Fix

**Goal:** Apply the minimal fix that makes the failing test pass.

1. Apply the SMALLEST change that fixes the root cause
2. Run the reproduction test → should now PASS
3. Run ALL existing tests → should still PASS (no regressions)
4. Remove instrumentation code from Phase 4

```kotlin
// FIX: Add empty string check
fun validateName(name: String?): ValidationResult {
    if (name == null || name.isBlank()) {
        return ValidationResult.invalid("name must not be empty")
    }
    return ValidationResult.valid()
}
```

**Rules:**
- Fix must be MINIMAL — don't refactor unrelated code
- Fix must make reproduction test PASS
- Fix must not break any existing tests
- If fix requires more than ~20 lines → discuss with SA/SM first

**Exit criteria:** Reproduction test passes, all other tests pass.

### Phase 6: Cleanup

**Goal:** Ensure the fix is production-ready.

1. Remove ALL debug/instrumentation code
2. Ensure the reproduction test is properly named and documented:
   ```kotlin
   @Test
   fun `BUG-{TICKET}: should reject empty provider name`() { ... }
   ```
3. Run full test suite one final time
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
| 3 hypotheses all rejected (Phase 3-4 loop) | Report to SM: "Root cause unclear, need SA review" |
| Fix breaks other tests (Phase 5) | Report to SM: "Fix has side effects, need design discussion" |
| Fix requires >50 lines change | Report to SM: "Significant refactoring needed, upgrade to Story?" |

## Anti-Patterns (FORBIDDEN)

| ❌ Anti-Pattern | Why Bad | ✅ Correct Approach |
|----------------|---------|---------------------|
| "Try this fix and see if it works" | Guess-and-check wastes time | Write failing test FIRST |
| Fix without reproduction test | No proof bug existed or is fixed | ALWAYS Phase 2 before Phase 5 |
| Shotgun fix (change many things) | Can't identify which change helped | Minimal, targeted fix only |
| "It works on my machine" | No automated verification | Reproduction test proves it |
| Skip cleanup (leave debug code) | Pollutes production code | ALWAYS Phase 6 |
| Fix bug + refactor in same commit | Muddles git history, hard to revert | Separate commits |

## Integration with SM Pipeline

- SM detects bug fix mode from Jira ticket type or transition
- SM invokes DEV with: `"Fix bug {TICKET}. Follow dev-bug-diagnosis.md loop."`
- DEV reports back with Bug Fix Report
- SM verifies: reproduction test exists + all tests green
- SM transitions Jira accordingly
