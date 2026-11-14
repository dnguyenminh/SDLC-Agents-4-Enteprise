// e2e/features/step_definitions/governance.steps.ts — glue: SA4E-355 governance assertions
// (delegation ONLY — BR-04, TDD §6.5).
//
// The shared Given 'the IDE is launched with the extension under development' lives
// ONCE in workbench.steps.ts; chat-panel When steps live in webview.steps.ts —
// this file declares ONLY the new governance Then steps (no duplicates).
// Waiting/polling is delegated via the WaitForText Screenplay interaction
// (@serenity-js/assertions only guarantees `equals`/`not`/`isTrue` in this repo,
// so substring/wait logic lives in the interaction's predicates).
import { Then } from '@cucumber/cucumber';
import { actorCalled } from '@serenity-js/core';
import { WaitForText } from '../../src/screenplay/interactions/WaitForText';
import { ChatReplyText } from '../../src/screenplay/questions/ChatReplyText';
import { ContextBadgeText } from '../../src/screenplay/questions/ContextBadgeText';

Then('the chat reply shows no context overflow error', () =>
    actorCalled('QA').attemptsTo(
        WaitForText(
            ChatReplyText(),
            (text) => text.trim().length > 0,
            'STC-703: no chat reply rendered within budget turn',
            (reply) => {
                if (/exceed_context_size_error|PI_CONTEXT_BUDGET_EXCEEDED/.test(reply)) {
                    throw new Error(`STC-703: turn overflowed the budget (reply: "${reply.slice(0, 200)}")`);
                }
            },
        ),
    ),
);

Then('the context usage indicator shows a non-zero usage', () =>
    actorCalled('QA').attemptsTo(
        WaitForText(
            ContextBadgeText(),
            (text) => text.trim().length > 0 && !/^0(%| tokens)?$/i.test(text.trim()),
            'STC-500: usage indicator stayed empty or zero after the governed turn',
            (badge) => {
                if (!/\d/.test(badge)) throw new Error(`STC-500: indicator carries no usage number ("${badge}")`);
            },
        ),
    ),
);

Then('the chat reply shows the actionable budget error with numeric values', () =>
    actorCalled('QA').attemptsTo(
        WaitForText(
            ChatReplyText(),
            (text) => text.includes('PI_CONTEXT_BUDGET_EXCEEDED'),
            'STC-501: actionable budget error never rendered',
            (reply) => {
                const match = /static context (\d+) tokens.*budget (\d+).*n_ctx=(\d+)/.exec(reply);
                if (!match) {
                    throw new Error(`STC-501: banner lacks numeric N/M/K values (reply: "${reply.slice(0, 200)}")`);
                }
                if (/exceed_context_size_error/.test(reply)) {
                    throw new Error('STC-501: raw provider 400 leaked into the chat surface');
                }
            },
        ),
    ),
);
