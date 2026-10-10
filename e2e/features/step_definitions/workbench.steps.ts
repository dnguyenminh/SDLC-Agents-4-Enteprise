// e2e/features/step_definitions/workbench.steps.ts — glue: workbench steps
// (delegation ONLY — BR-04, TDD §6.5).
//
// Every step delegates to a Screenplay Task/Question — zero raw WebdriverIO commands here.
// The Given 'the IDE is launched with the extension under development' is defined ONCE in
// this file and is shared by all features (smoke/workbench/commands/webview) — Cucumber
// raises an AmbiguousStep error on duplicate step definitions, so other step-definition
// files must not re-declare it.
import { Given, Then, When } from '@cucumber/cucumber';
import { actorCalled } from '@serenity-js/core';
import { Ensure, equals, isTrue } from '@serenity-js/assertions';
import { OpenWorkspace } from '../../src/screenplay/tasks/OpenWorkspace';
import { OpenEditor } from '../../src/screenplay/tasks/OpenEditor';
import { RunCommand } from '../../src/screenplay/tasks/RunCommand';
import { ActiveTabText } from '../../src/screenplay/questions/ActiveTabText';
import { IsPanelVisible } from '../../src/screenplay/questions/IsPanelVisible';

Given('the IDE is launched with the extension under development', async () => {
    await actorCalled('QA').attemptsTo(OpenWorkspace());
});

When('the editor opens the file {string}', async (path: string) => {
    await actorCalled('QA').attemptsTo(OpenEditor(path));
});

Then('the active editor tab shows {string}', async (expected: string) => {
    await actorCalled('QA').attemptsTo(Ensure.that(ActiveTabText(), equals(expected)));
});

When('the command {string} is executed', async (command: string) => {
    await actorCalled('QA').attemptsTo(RunCommand(command));
});

Then('the panel area is visible', async () => {
    await actorCalled('QA').attemptsTo(Ensure.that(IsPanelVisible('panel'), isTrue()));
});
