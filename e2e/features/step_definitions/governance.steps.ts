// e2e/features/step_definitions/governance.steps.ts — glue: SA4E-355 governance assertions
// (delegation ONLY — BR-04, TDD §6.5).
//
// The shared Given 'the IDE is launched with the extension under development' lives
// ONCE in workbench.steps.ts; chat-panel When steps live in webview.steps.ts —
// this file declares ONLY the new governance Then steps (no duplicates).
// Polling uses Question.answeredBy directly: @serenity-js/assertions only
// guarantees `equals`/`not`/`isTrue` in this repo, so substring/wait logic
// below avoids unverified matcher APIs.
import { Then } from '@cucumber/cucumber';
import { actorCalled } from '@serenity-js/core';
import { ChatReplyText } from '../../src/screenplay/questions/ChatReplyText';
import { ContextBadgeText } from '../../src/screenplay/questions/ContextBadgeText';

const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

/** Polls a question until `accept` holds or the timeout expires. */
async function pollUntilText(
    read: () => Promise<string>,
    accept: (text: string) => boolean,
    timeoutMessage: string,
): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let latest = await read();
    while (!accept(latest)) {
        if (Date.now() >= deadline) throw new Error(`${timeoutMessage} (last: "${latest.slice(0, 160)}")`);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        latest = await read();
    }
    return latest;
}

Then('the chat reply shows no context overflow error', async () => {
    const actor = actorCalled('QA');
    const reply = await pollUntilText(
        () => ChatReplyText().answeredBy(actor),
        (text) => text.trim().length > 0,
        'STC-703: no chat reply rendered within budget turn',
    );
    if (/exceed_context_size_error|PI_CONTEXT_BUDGET_EXCEEDED/.test(reply)) {
        throw new Error(`STC-703: turn overflowed the budget (reply: "${reply.slice(0, 200)}")`);
    }
});

Then('the context usage indicator shows a non-zero usage', async () => {
    const actor = actorCalled('QA');
    const badge = await pollUntilText(
        () => ContextBadgeText().answeredBy(actor),
        (text) => text.trim().length > 0 && !/^0(%| tokens)?$/i.test(text.trim()),
        'STC-500: usage indicator stayed empty or zero after the governed turn',
    );
    if (!/\d/.test(badge)) throw new Error(`STC-500: indicator carries no usage number ("${badge}")`);
});

Then('the chat reply shows the actionable budget error with numeric values', async () => {
    const actor = actorCalled('QA');
    const reply = await pollUntilText(
        () => ChatReplyText().answeredBy(actor),
        (text) => text.includes('PI_CONTEXT_BUDGET_EXCEEDED'),
        'STC-501: actionable budget error never rendered',
    );
    const match = /static context (\d+) tokens.*budget (\d+).*n_ctx=(\d+)/.exec(reply);
    if (!match) {
        throw new Error(`STC-501: banner lacks numeric N/M/K values (reply: "${reply.slice(0, 200)}")`);
    }
    if (/exceed_context_size_error/.test(reply)) {
        throw new Error('STC-501: raw provider 400 leaked into the chat surface');
    }
});
