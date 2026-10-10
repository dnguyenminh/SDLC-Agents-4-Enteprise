// e2e/src/screenplay/tasks/SendChatMessage.ts — UC-05 (webview interaction, TDD §6.3)
//
// SPIKE-3 actuals (verified against wdio-vscode-service 8.0.0 typings and the real
// extension/src/webview/components/ChatInput.svelte source):
//  - Webview reach strategy: workbench.getWebviewByTitle(RegExp) + webview.open()/close()
//    (the switchFrame strategy anticipated at SPIKE-3). TDD §6.3's `getWebviewByLocator`
//    does not exist in wdio-vscode-service 8.0.0.
//  - Real webview selectors from ChatInput.svelte: `.chat-textarea` (aria-label
//    "Chat message input") and `.send-button` (aria-label "Send message"). TDD §6.3's
//    'textarea, input[type="text"]' / 'button[type="submit"]' are adjusted accordingly.
import { Interaction, Task } from '@serenity-js/core';
import { browserOf, withWorkbench } from '../interactions/withWorkbench';

const CHAT_WEBVIEW_TITLE_PATTERN = /sdlc/i;   // matches the 'SDLC Chat' webview panel title (SPIKE-3)
const CHAT_INPUT_SELECTOR = '.chat-textarea';
const SEND_BUTTON_SELECTOR = '.send-button';

/**
 * Low-level interaction: switches into the chat webview context, fills the input,
 * clicks send, then leaves the webview context (WebView.open()/close() contract).
 */
const TypeAndSendChatMessage = (message: string) =>
    Interaction.where(`#actor enters "${message}" into the chat input and sends it`,
        async (actor) => {
            const workbench = await withWorkbench(actor);
            const chatWebview = await workbench.getWebviewByTitle(CHAT_WEBVIEW_TITLE_PATTERN);
            await chatWebview.open();
            const browser = browserOf(actor);
            try {
                await (await browser.$(CHAT_INPUT_SELECTOR)).setValue(message);
                await (await browser.$(SEND_BUTTON_SELECTOR)).click();
            } finally {
                await chatWebview.close();
            }
        },
    );

export const SendChatMessage = (message: string) =>
    Task.where(`#actor sends the chat message "${message}"`,
        TypeAndSendChatMessage(message),
    );
