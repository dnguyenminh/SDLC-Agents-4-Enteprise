// e2e/src/screenplay/questions/ChatReplyText.ts — UC-05 (webview state, TDD §6.4)
//
// SPIKE-3 actuals (verified against wdio-vscode-service 8.0.0 typings and the real
// extension/src/webview/components/ChatMessageList.svelte source): the webview is reached
// via workbench.getWebviewByTitle(RegExp) + webview.open()/close(); the real message-list
// selector is '.message-list' (TDD §6.4's '.chat-messages' is adjusted accordingly).
import { Question } from '@serenity-js/core';
import { browserOf, withWorkbench } from '../interactions/withWorkbench';

const CHAT_WEBVIEW_TITLE_PATTERN = /sdlc/i;
const MESSAGE_LIST_SELECTOR = '.message-list';

export const ChatReplyText = () =>
    Question.about('the chat reply area content', async (actor) => {
        const workbench = await withWorkbench(actor);
        const chatWebview = await workbench.getWebviewByTitle(CHAT_WEBVIEW_TITLE_PATTERN);
        await chatWebview.open();
        try {
            const browser = browserOf(actor);
            return await (await browser.$(MESSAGE_LIST_SELECTOR)).getText();
        } finally {
            await chatWebview.close();
        }
    });
