# e2e/features/webview/budget-error-banner.feature — STC-501 (SA4E-355 UC-05/BR-09)
Feature: Budget exceeded error banner is actionable
  On a tiny-window provider (n_ctx=2,048) with an oversized workspace, the
  gate REJECTs and the chat surface shows the exact PI_CONTEXT_BUDGET_EXCEEDED
  text with numeric N/M/K values — never a raw 400. Chat errors render inside
  the verified `.message-list` selector (ChatMessageList.svelte).
  Prerequisite (env): simulated provider with n_ctx=2048 + oversized fixture.

  Scenario: Budget exceeded error banner is actionable
    Given the IDE is launched with the extension under development
    When the SDLC chat panel is opened
    And a chat message "Hãy review source code" is sent
    Then the chat reply shows the actionable budget error with numeric values
