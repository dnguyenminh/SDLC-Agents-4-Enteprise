# e2e/features/webview/context-usage-indicator.feature — STC-500 (SA4E-355 UC-01)
Feature: Context usage indicator mirrors the measured budget
  After a governed turn-1 on the simulated 32k provider, the context badge
  (verified selector `.context-badge` in ContextBadge.svelte) shows a
  non-zero usage that reflects static + history against the budgets.

  Scenario: Usage indicator shows static and history usage
    Given the IDE is launched with the extension under development
    When the SDLC chat panel is opened
    And a chat message "Hãy review source code" is sent
    Then the chat reply area renders a response
    And the context usage indicator shows a non-zero usage
