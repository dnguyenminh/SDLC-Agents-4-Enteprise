// e2e/features/step_definitions/commands.steps.ts — glue: extension-command steps
// (delegation ONLY — BR-04, TDD §6.5).
//
// Every step delegates to a Screenplay Task/Question — zero raw WebdriverIO commands here.
//
// NOTE on shared steps (AmbiguousStep guard): the Given 'the IDE is launched with the
// extension under development' is defined ONCE in workbench.steps.ts and is shared by all
// features (smoke/workbench/commands/webview). The generic steps used by
// features/commands/run-extension-command.feature ('the command {string} is executed',
// 'the panel area is visible') are also already defined in workbench.steps.ts, so this
// file MUST NOT re-declare them (Cucumber raises an AmbiguousStep error on duplicate
// definitions). It therefore provides command-journey vocabulary with DISTINCT expressions.
import { Given, Then, When } from '@cucumber/cucumber';
import { actorCalled } from '@serenity-js/core';
import { Ensure, isTrue } from '@serenity-js/assertions';
import { OpenWorkspace } from '../../src/screenplay/tasks/OpenWorkspace';
import { RunCommand } from '../../src/screenplay/tasks/RunCommand';
import { IsPanelVisible } from '../../src/screenplay/questions/IsPanelVisible';

Given('the extension development workspace is open', async () => {
    await actorCalled('QA').attemptsTo(OpenWorkspace());
});

When('the extension command {string} runs', async (command: string) => {
    await actorCalled('QA').attemptsTo(RunCommand(command));
});

Then('the {string} panel becomes visible', async (panelId: string) => {
    await actorCalled('QA').attemptsTo(Ensure.that(IsPanelVisible(panelId), isTrue()));
});
