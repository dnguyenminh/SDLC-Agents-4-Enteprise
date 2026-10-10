// e2e/features/step_definitions/webview.steps.ts — glue: webview steps
// (delegation ONLY — BR-04, TDD §6.5).
//
// The shared Given 'the IDE is launched with the extension under development' is defined
// ONCE in workbench.steps.ts — do not re-declare it here (Cucumber AmbiguousStep).
// NOTE: @cucumber/cucumber 13 exports only Given/When/Then — the Gherkin `And` keyword in
// feature files is matched by its preceding keyword (When), so definitions use `When`.
import { Then, When } from '@cucumber/cucumber';
import { actorCalled } from '@serenity-js/core';
import { Ensure, equals, not } from '@serenity-js/assertions';
import { OpenChatPanel } from '../../src/screenplay/tasks/OpenChatPanel';
import { SendChatMessage } from '../../src/screenplay/tasks/SendChatMessage';
import { ChatReplyText } from '../../src/screenplay/questions/ChatReplyText';

When('the SDLC chat panel is opened', async () => {
    await actorCalled('QA').attemptsTo(OpenChatPanel());
});

When('a chat message {string} is sent', async (message: string) => {
    await actorCalled('QA').attemptsTo(SendChatMessage(message));
});

Then('the chat reply area renders a response', async () => {
    await actorCalled('QA').attemptsTo(Ensure.that(ChatReplyText(), not(equals(''))));
});
