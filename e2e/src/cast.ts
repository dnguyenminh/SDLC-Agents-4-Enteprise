// e2e/src/cast.ts — Serenity cast: actor roster and abilities (TDD §5.2, FSD §5.1/§6.3)
//
// SPIKE-1 actual (verified against @serenity-js/webdriverio 3.48.2 adapter source,
// WebdriverIOFrameworkAdapter.js): the cast is registered via the wdio config
// `serenity.actors` key (`actors: config.serenity.actors || Cast.where(...)`).
// The adapter invokes Serenity.configure() itself, so the cast must NOT be wired
// through a manual Serenity.configure() call in a before() hook (as sketched in TDD §5.1).
//
// The adapter's default cast binds `BrowseTheWebWithWebdriverIO.using(global.browser)`;
// this cast mirrors that behaviour via the typed @wdio/globals accessor and additionally
// grants an empty notepad (parity with the adapter default cast).
// The browser handle is resolved lazily inside prepare() — at actor-creation time, when
// the WDIO session is already live (FSD §6.3).
import { Actor, Cast, TakeNotes } from '@serenity-js/core';
import { BrowseTheWebWithWebdriverIO } from '@serenity-js/webdriverio';
import { browser } from '@wdio/globals';

export class Actors implements Cast {
    prepare(actor: Actor): Actor {
        return actor.whoCan(
            // Binds the actor to the WDIO browser/IDE session (FSD §6.3)
            BrowseTheWebWithWebdriverIO.using(browser),
            TakeNotes.usingAnEmptyNotepad(),
        );
    }
}
