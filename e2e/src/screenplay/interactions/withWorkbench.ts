// e2e/src/screenplay/interactions/withWorkbench.ts — low-level helper shared by tasks
// (TDD §6.1 interactions layer, §8.1 item 7).
//
// SPIKE-1 actual (verified against @serenity-js/webdriverio 3.48.2 typings): the ability
// `BrowseTheWebWithWebdriverIO` does NOT expose the underlying WDIO browser handle —
// there is no `.browse()` method as sketched in TDD §6.3, and the `session` field is
// protected. Meanwhile, the wdio-vscode-service page objects (Workbench/EditorView/WebView)
// are exposed as browser commands added at runtime (browser.getWorkbench(),
// see wdio-vscode-service dist/service.d.ts VSCodeCommands augmentation).
//
// This helper is the SINGLE place that bridges the actor's ability to the raw WDIO
// browser handle, keeping tasks Screenplay-shaped (BR-04: step definitions delegate only).
// The browser MUST come from the actor's ability (not from @wdio/globals) so that
// UT-level tests can mock it via BrowseTheWebWithWebdriverIO.using(mockBrowser)
// (STC TC-03/TC-04).
import { UsesAbilities } from '@serenity-js/core';
import { BrowseTheWebWithWebdriverIO } from '@serenity-js/webdriverio';
import type { Workbench } from 'wdio-vscode-service';
// Type-only imports: pull the global `WebdriverIO.Browser` namespace (webdriverio)
// and the wdio-vscode-service `Browser` command augmentation (getWorkbench, ...)
// into the TypeScript program. The service augments the GLOBAL WebdriverIO.Browser
// interface — the module-scoped `Browser` export of 'webdriverio' is NOT augmented,
// so references here must use the global `WebdriverIO.Browser` type.
import type {} from 'webdriverio';

/**
 * Minimal structural view of the protected `session` field on the ability,
 * used as the documented bridge to the raw WDIO browser handle (see file header).
 */
interface AbilityExposingSession {
    session: { browser: WebdriverIO.Browser };
}

/**
 * Resolves the raw WDIO browser handle bound to the actor's browsing ability.
 */
export function browserOf(actor: UsesAbilities): WebdriverIO.Browser {
    const ability = BrowseTheWebWithWebdriverIO.as(actor);
    return (ability as unknown as AbilityExposingSession).session.browser;
}

/**
 * Resolves the wdio-vscode-service Workbench page object for the actor's session.
 */
export async function withWorkbench(actor: UsesAbilities): Promise<Workbench> {
    return await browserOf(actor).getWorkbench();
}
