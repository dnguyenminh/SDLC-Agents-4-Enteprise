// e2e/features/step_definitions/smoke.steps.ts — glue: smoke steps
// (delegation ONLY — BR-04, TDD §6.5).
//
// The shared Given 'the IDE is launched with the extension under development' is defined
// ONCE in workbench.steps.ts — do not re-declare it here (Cucumber AmbiguousStep).
import { Then } from '@cucumber/cucumber';
import { actorCalled } from '@serenity-js/core';
import { Ensure, isTrue } from '@serenity-js/assertions';
import { IsPanelVisible } from '../../src/screenplay/questions/IsPanelVisible';

Then('the workbench is ready', async () => {
    await actorCalled('QA').attemptsTo(Ensure.that(IsPanelVisible('workbench'), isTrue()));
});
