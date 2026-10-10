# e2e/features/commands/run-extension-command.feature — UC-04 (TDD §8.1 item 18, STC TC-12)
Feature: Extension command journey — run command
  QA executes an extension command inside the IDE and observes the panel response.

  Scenario: Execute the SDLC agentic chat command
    Given the IDE is launched with the extension under development
    When the command "sdlcAgents.openAgenticChat" is executed
    Then the panel area is visible
