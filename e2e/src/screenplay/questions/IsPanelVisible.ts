// e2e/src/screenplay/questions/IsPanelVisible.ts — UC-04 (panel visibility, TDD §6.4)
//
// Selector resolution (SPIKE-1 actual — real VSCode workbench DOM): the workbench shell
// is '.monaco-workbench'; workbench areas are '#workbench.parts.<name>' (activitybar,
// editor, panel, statusbar, titlebar). TDD §6.4's '[data-panel-id*=...]' selector is
// adjusted to the real workbench-parts convention. The name 'workbench' resolves to
// the workbench shell (STC TC-04 step 4: IsPanelVisible("workbench")).
import { Question } from '@serenity-js/core';
import { browserOf } from '../interactions/withWorkbench';

const WORKBENCH_SHELL_SELECTOR = '.monaco-workbench';
const WORKBENCH_PART_SELECTOR_PREFIX = '#workbench.parts.';

function panelSelector(panelName: string): string {
    return panelName === 'workbench'
        ? WORKBENCH_SHELL_SELECTOR
        : `${WORKBENCH_PART_SELECTOR_PREFIX}${panelName}`;
}

export const IsPanelVisible = (panelName: string) =>
    Question.about(`whether the ${panelName} panel is visible`, async (actor) => {
        const browser = browserOf(actor);
        const panel = await browser.$(panelSelector(panelName));
        return await panel.isDisplayed();
    });
