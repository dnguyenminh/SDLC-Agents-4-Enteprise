---
name: dev-bug-diagnosis
description: 6-phase diagnosis loop for bug fixing — reproduce first, then fix
---

## 6-Phase Diagnosis Loop

### Phase 1: Build Feedback Loop
- Ensure project compiles before attempting any fix
- If compilation fails, fix compilation first

### Phase 2: Reproduce
- Write a FAILING reproduction test FIRST
- The test must demonstrate the bug without any doubt
- This is a RED test (in TDD terminology)

### Phase 3: Hypothesise
- Form specific, testable hypotheses about root cause
- Example: "The null pointer is caused by missing null check in UserService.getProfile()"
- NOT: "Something is broken somewhere"

### Phase 4: Instrument
- Verify hypothesis with observation
- Add logging, read source code, check stack traces
- If hypothesis is wrong, go back to Phase 3

### Phase 5: Fix
- Make MINIMAL change to make reproduction test pass
- Do NOT refactor unrelated code
- Only change what's needed to fix the specific bug

### Phase 6: Cleanup
- Remove debug code/logging
- Remove temporary instrumentation
- Run ALL tests (not just the reproduction test)
- Commit with clear message referencing the bug ticket

## Core Rule
"No red-capable command, no fix attempt."
You CANNOT attempt a fix without a failing reproduction test.
