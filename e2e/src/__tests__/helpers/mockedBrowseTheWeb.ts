// e2e/src/__tests__/helpers/mockedBrowseTheWeb.ts — UT-level ability test double
// (STC TC-03/TC-04: actor bound to a mocked BrowseTheWebWithWebdriverIO handle).
//
// BrowseTheWebWithWebdriverIO.using() constructs a REAL WebdriverIOBrowsingSession,
// which validates the WDIO handle is initialised (requires browser.$ / browser.$$) and
// throws LogicError otherwise. Unit tests must never require a live WDIO session, so
// this helper builds the ability by injecting a FAKE session at construction time
// (mock at the WebdriverIOBrowsingSession level) instead of calling using().
//
// The real ability class is kept, so `instanceof` checks pass and the documented
// bridge `browserOf(actor)` (ability.session.browser, see withWorkbench.ts) resolves
// to the injected mock handle. No IDE is spawned (postcondition: mock discarded).
import { BrowseTheWebWithWebdriverIO } from '@serenity-js/webdriverio';

/** Constructor parameter of the real ability — the BrowsingSession slot to fake. */
type AbilitySession = ConstructorParameters<typeof BrowseTheWebWithWebdriverIO>[0];

/**
 * Builds a `BrowseTheWebWithWebdriverIO` ability bound to a mock WDIO browser handle
 * WITHOUT invoking `BrowseTheWebWithWebdriverIO.using()` (which requires an initialised
 * WDIO browser — see file header).
 */
export function browseTheWebWithMockedSession(browserHandle: unknown): BrowseTheWebWithWebdriverIO {
    const fakeSession = { browser: browserHandle } as unknown as AbilitySession;
    return new BrowseTheWebWithWebdriverIO(fakeSession);
}
