# e2e/features/smoke/launch.feature — UC-01/UC-03 evidence (BR-07)
Feature: IDE launch smoke
  The framework launches the target IDE with the extension under development.

  Scenario: IDE launches and workbench is ready
    Given the IDE is launched with the extension under development
    Then the workbench is ready
