// STC: TC-04 — Screenplay Questions (ActiveTabText, IsPanelVisible) with mock WDIO
// (UC-04 FSD 3.4, BR-04, TDD §6.4).
//
// STC step 1: actor bound to the mocked WDIO handle — the ability is injected with a fake
//             browsing session (mockedBrowseTheWeb helper) since using() requires a live
//             WDIO browser (see helpers/mockedBrowseTheWeb.ts).
// STC step 2: mock returns a tab titled "extension.ts" → ActiveTabText() returns the mocked
//             title; Ensure.that(..., equals("extension.ts")) passes.
// STC step 3: mock getActiveTab() to return undefined → ActiveTabText() returns "" (empty
//             string — safe default, no throw).
// STC step 4: IsPanelVisible("workbench") with mock isDisplayed returning true → true;
//             noun-phrase naming verified ("whether the workbench panel is visible").
// Postconditions: no side effects.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cast, engage, actorCalled } from '@serenity-js/core';
import { Ensure, equals, isTrue } from '@serenity-js/assertions';
import { ActiveTabText } from '../screenplay/questions/ActiveTabText';
import { IsPanelVisible } from '../screenplay/questions/IsPanelVisible';
import { browseTheWebWithMockedSession } from './helpers/mockedBrowseTheWeb';

const mocks = vi.hoisted(() => {
    const mockTab = {
        getTitle: vi.fn<() => Promise<string>>().mockResolvedValue('extension.ts'),
    };
    const mockEditorView = {
        getActiveTab: vi.fn<() => Promise<unknown>>().mockResolvedValue(mockTab),
    };
    const mockWorkbench = {
        getEditorView: vi.fn(() => mockEditorView),
    };
    const mockPanel = {
        isDisplayed: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    };
    const mockBrowser = {
        getWorkbench: vi.fn<() => Promise<unknown>>().mockResolvedValue(mockWorkbench),
        $: vi.fn<() => Promise<unknown>>().mockResolvedValue(mockPanel),
    };
    return { mockTab, mockEditorView, mockWorkbench, mockPanel, mockBrowser };
});

/** Creates the actor with the ability bound to the mocked WDIO handle (STC TC-04 step 1). */
function actorWithMockedBrowser() {
    engage(Cast.where((actor) => actor.whoCan(
        browseTheWebWithMockedSession(mocks.mockBrowser),
    )));
    return actorCalled('QA');
}

describe('TC-04: Screenplay Questions with mock WDIO (UT)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockTab.getTitle.mockResolvedValue('extension.ts');
        mocks.mockEditorView.getActiveTab.mockResolvedValue(mocks.mockTab);
        mocks.mockWorkbench.getEditorView.mockReturnValue(mocks.mockEditorView);
        mocks.mockPanel.isDisplayed.mockResolvedValue(true);
        mocks.mockBrowser.getWorkbench.mockResolvedValue(mocks.mockWorkbench);
        mocks.mockBrowser.$.mockResolvedValue(mocks.mockPanel);
    });

    it('ActiveTabText returns the mocked tab title; assertion passes (STC step 2)', async () => {
        const actor = actorWithMockedBrowser();

        await actor.attemptsTo(Ensure.that(ActiveTabText(), equals('extension.ts')));

        expect(mocks.mockTab.getTitle).toHaveBeenCalledTimes(1);
    });

    it('ActiveTabText returns "" when no tab is active — safe default, no throw (STC step 3)', async () => {
        mocks.mockEditorView.getActiveTab.mockResolvedValue(undefined);
        const actor = actorWithMockedBrowser();

        const text = await actor.answer(ActiveTabText());

        expect(text).toBe('');
    });

    it('IsPanelVisible returns true when the panel is displayed (STC step 4)', async () => {
        const actor = actorWithMockedBrowser();

        await actor.attemptsTo(Ensure.that(IsPanelVisible('workbench'), isTrue()));

        expect(mocks.mockPanel.isDisplayed).toHaveBeenCalledTimes(1);
        expect(mocks.mockBrowser.$).toHaveBeenCalledWith('.monaco-workbench');
    });

    it('IsPanelVisible resolves workbench areas via the workbench-parts convention', async () => {
        const actor = actorWithMockedBrowser();

        await actor.answer(IsPanelVisible('panel'));

        expect(mocks.mockBrowser.$).toHaveBeenCalledWith('#workbench.parts.panel');
    });

    it('questions use noun-phrase naming (STC step 4 — FSD UC-04 validation rules)', () => {
        expect(ActiveTabText().toString()).toContain('the text of the active editor tab');
        expect(IsPanelVisible('workbench').toString()).toContain('whether the workbench panel is visible');
    });
});
