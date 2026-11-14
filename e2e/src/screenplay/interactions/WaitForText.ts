// e2e/src/screenplay/interactions/WaitForText.ts — poll-a-question-until-settled
// interaction (BR-04: step definitions delegate via attemptsTo — TC-05 audit).
//
// Wraps the STC-50x/703 polling pattern (previously a raw helper inside
// governance.steps.ts) as a Screenplay Interaction: the actor ANSWERS the
// question repeatedly until an acceptance predicate holds, then runs an
// optional content assertion. No raw WebdriverIO in step definitions.
import { Interaction, Question } from '@serenity-js/core';

const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

export const WaitForText = (
    question: Question<Promise<string>> | Question<string>,
    accept: (text: string) => boolean,
    timeoutMessage: string,
    assert?: (text: string) => void,
) =>
    Interaction.where(`#actor waits until ${question} settles`, async (actor) => {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let latest: string = await actor.answer(question);
        while (!accept(latest)) {
            if (Date.now() >= deadline) {
                throw new Error(`${timeoutMessage} (last: "${latest.slice(0, 160)}")`);
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            latest = await actor.answer(question);
        }
        if (assert) {
            assert(latest);
        }
    });
