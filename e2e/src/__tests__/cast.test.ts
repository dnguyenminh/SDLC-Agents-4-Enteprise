// STC: TC-03 (cast side) — actor creation + abilities attach (UT level, mock WDIO handle).
//
// Per STC TC-03 step 1: "Create an actor with a mocked BrowseTheWebWithWebdriverIO handle"
// — the actor is created through the Serenity cast (e2e/src/cast.ts, TDD §5.2) with the
// ability bound to the mock; no IDE is spawned (postcondition: mock discarded).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { engage, actorCalled } from '@serenity-js/core';
import { BrowseTheWebWithWebdriverIO } from '@serenity-js/webdriverio';
import { Actors } from '../cast';
import { browserOf, withWorkbench } from '../screenplay/interactions/withWorkbench';

const { mockBrowser } = vi.hoisted(() => ({
    // WebdriverIOBrowsingSession validates browser.$ / browser.$$ at construction time
    // (see helpers/mockedBrowseTheWeb.ts) — the cast binds the ability via .using(),
    // so the mocked handle must satisfy that contract.
    mockBrowser: {
        sessionId: 'mock-session',
        $: vi.fn(),
        $$: vi.fn(),
    } as unknown as WebdriverIO.Browser,
}));

// The cast resolves the WDIO browser handle via @wdio/globals — mocked for UT level.
vi.mock('@wdio/globals', () => ({
    browser: mockBrowser,
}));

describe('Actors cast (TDD §5.2 — actor roster and abilities)', () => {
    beforeEach(() => {
        engage(new Actors());
    });

    it('attaches BrowseTheWebWithWebdriverIO to every actor (STC TC-03 step 1)', () => {
        const actor = actorCalled('QA');
        const ability = actor.abilityTo(BrowseTheWebWithWebdriverIO);
        expect(ability).toBeInstanceOf(BrowseTheWebWithWebdriverIO);
    });

    it('binds the ability to the injected browser handle (STC TC-03: ability bound to the mock)', () => {
        const actor = actorCalled('QA');
        expect(browserOf(actor)).toBe(mockBrowser);
    });

    it('grants the same ability to differently named actors (cast roster behaviour)', () => {
        const qa = actorCalled('QA');
        const reviewer = actorCalled('Reviewer');
        expect(qa.abilityTo(BrowseTheWebWithWebdriverIO)).toBeInstanceOf(BrowseTheWebWithWebdriverIO);
        expect(reviewer.abilityTo(BrowseTheWebWithWebdriverIO)).toBeInstanceOf(BrowseTheWebWithWebdriverIO);
    });

    it('resolves the Workbench page object through the ability bridge (withWorkbench helper)', async () => {
        const actor = actorCalled('QA');
        // The mock browser handle is the bridge target — getWorkbench is a service command
        // added at runtime; at UT level the mock provides it directly.
        const mockWorkbench = { wait: vi.fn() };
        (mockBrowser as unknown as { getWorkbench: () => Promise<unknown> }).getWorkbench =
            vi.fn(() => Promise.resolve(mockWorkbench));

        const workbench = await withWorkbench(actor);
        expect(workbench).toBe(mockWorkbench);
    });
});
