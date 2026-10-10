# e2e/features/workbench/open-editor.feature — UC-04 sample (TDD §7.1)
Feature: Core workbench journey — open editor
  QA opens a file in the editor and sees its tab activated.

  Scenario: Open a file and verify the active tab
    Given the IDE is launched with the extension under development
    When the editor opens the file "extension/src/extension.ts"
    Then the active editor tab shows "extension.ts"
