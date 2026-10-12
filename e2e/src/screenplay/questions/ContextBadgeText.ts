// e2e/src/screenplay/questions/ContextBadgeText.ts — STC-500 (SA4E-355 UC-01)
//
// Verified against extension/src/webview/components/ContextBadge.svelte:
// the indicator root is `.context-badge` (ChatHeader renders <ContextBadge />
// in `.context-badge-wrapper`). Reached via the standard
// workbench.getWebviewByTitle(/sdlc/i) + open()/close() contract.
import { Question } from '@serenity-js/core';
import { browserOf, withWorkbench } from '../interactions/withWorkbench';

const CHAT_WEBVIEW_TITLE_PATTERN = /sdlc/i;
const CONTEXT_BADGE_SELECTOR = '.context-badge';

export const ContextBadgeText = () =>
    Question.about('the context usage indicator text', async (actor) => {
        const workbench = await withWorkbench(actor);
        const chatWebview = await workbench.getWebviewByTitle(CHAT_WEBVIEW_TITLE_PATTERN);
        await chatWebview.open();
        try {
            const browser = browserOf(actor);
            return await (await browser.$(CONTEXT_BADGE_SELECTOR)).getText();
        } finally {
            await chatWebview.close();
        }
    });
