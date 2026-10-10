// e2e/src/screenplay/interactions/WaitUntilWorkbenchReady.ts — workbench-ready wait
// (TDD §6.6 — flaky prevention: Screenplay Wait interactions instead of sleeps).
// `.monaco-workbench` is the real VSCode workbench shell selector (SPIKE-1 actual).
//
// SPIKE-1 actual (verified against @serenity-js/core 3.48.2 runtime): plain async functions
// are accepted by `Interaction.where` but NOT usable as `Task.where` activities — the
// runtime resolves activities via `activity.performAs`, which plain functions lack.
// Low-level steps are therefore Interactions, composed into Tasks (TDD §6.2 decomposition).
import { Interaction } from '@serenity-js/core';
import { browserOf } from './withWorkbench';

const WORKBENCH_SHELL_SELECTOR = '.monaco-workbench';
const WORKBENCH_READY_TIMEOUT_MS = 30_000;

export const WaitUntilWorkbenchReady = () =>
    Interaction.where(`#actor waits until the workbench is ready`,
        async (actor) => {
            const browser = browserOf(actor);
            await browser.waitUntil(
                async () => (await browser.$(WORKBENCH_SHELL_SELECTOR)).isDisplayed(),
                {
                    timeout: WORKBENCH_READY_TIMEOUT_MS,
                    timeoutMsg: `Workbench not ready within ${WORKBENCH_READY_TIMEOUT_MS / 1000}s`,
                },
            );
        },
    );
