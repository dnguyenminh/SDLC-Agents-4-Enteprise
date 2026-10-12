# e2e/features/workbench/turn1-context-governance.feature — STC-703 (SA4E-355 UC-07)
Feature: Turn 1 completes within budget on qwen 32k
  QA opens the SDLC chat panel and sends a review request against the
  simulated 32k provider (default model qwen). The turn must complete with
  no exceed_context_size_error and no budget error banner.
  Prerequisite (env): simulated provider with n_ctx=32768 (see STC-700).

  Scenario: Turn 1 completes within budget on qwen 32k
    Given the IDE is launched with the extension under development
    When the SDLC chat panel is opened
    And a chat message "Hãy review source code" is sent
    Then the chat reply area renders a response
    And the chat reply shows no context overflow error
