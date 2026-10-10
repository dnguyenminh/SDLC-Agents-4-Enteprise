# e2e/features/webview/chat-panel.feature — UC-05 (TDD §7.1, STC TC-15)
Feature: AI chat panel — webview interaction
  QA opens the extension chat panel, sends a message, and verifies the reply renders.

  Scenario: Send a chat message and see the reply
    Given the IDE is launched with the extension under development
    When the SDLC chat panel is opened
    And a chat message "Show status" is sent
    Then the chat reply area renders a response
