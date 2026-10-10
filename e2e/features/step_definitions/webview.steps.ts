// e2e/features/step_definitions/webview.steps.ts — glue: webview steps
// (delegation ONLY — BR-04, TDD §6.5).
//
// The shared Given 'the IDE is launched with the extension under development' is defined
// ONCE in workbench.steps.ts — do not re-declare it here (Cucumber AmbiguousStep).
// NOTE: @cucumber/cucumber 13 exports only Given/When/Then — the Gherkin `And` keyword in
// feature files is matched by its preceding keyword (When), so definitions use `When`.
import { Then, When } from '@cucumber/cucumber';
import { actorCalled, Duration, Wait } from '@serenity-js/core';
import { equals, not } from '@serenity-js/assertions';
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
    // Eventually-assertion: the extension relays the message to the SDLC backend
    // MCP server, which replies asynchronously — the reply area needs time to render.
    // NOTE: requires a reachable backend; without one the wait times out (honest fail).
    await actorCalled('QA').attemptsTo(
        Wait.upTo(Duration.ofSeconds(30)).until(ChatReplyText(), not(equals(''))),
    );
});
