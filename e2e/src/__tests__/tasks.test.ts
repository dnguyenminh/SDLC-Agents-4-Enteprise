// STC: TC-03 — Screenplay Tasks (OpenEditor, RunCommand) with mock WDIO
// (UC-04 FSD 3.4, BR-04, TDD §6.3).
//
// STC step 1: actor created with a mocked BrowseTheWebWithWebdriverIO handle (test double
// exposing workbench().getEditorView().openFile and executeCommand) — adapted per SPIKE-1
// actual: wdio-vscode-service 8.0.0 EditorView has no openFile(path); the verified flow is
// workbench.executeCommand('workbench.action.files.openFile') + InputBox.setText/confirm.
// STC step 2: the mock receives the file-open flow exactly once with the typed path argument.
// STC step 3: RunCommand("sdlcAgents.openAgenticChat") → executeCommand called exactly once
// with the command constant (real activation event from extension/package.json).
// STC step 4: task descriptions are verb phrases (BR-04 / FSD UC-04 validation rules).
// Postconditions: no IDE spawned; mock discarded.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cast, engage, actorCalled } from '@serenity-js/core';
import { OpenEditor } from '../screenplay/tasks/OpenEditor';
import { RunCommand } from '../screenplay/tasks/RunCommand';
import { OpenWorkspace } from '../screenplay/tasks/OpenWorkspace';
import { OpenChatPanel } from '../screenplay/tasks/OpenChatPanel';
import { SendChatMessage } from '../screenplay/tasks/SendChatMessage';
import { browseTheWebWithMockedSession } from './helpers/mockedBrowseTheWeb';

const mocks = vi.hoisted(() => {
    const mockInputBox = {
        setText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined),
        confirm: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const mockEditorView = {
        openEditor: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
        getActiveTab: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    };
    const mockWebview = {
        open: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const mockWorkbench = {
        executeCommand: vi.fn<() => Promise<unknown>>().mockResolvedValue(mockInputBox),
        getEditorView: vi.fn(() => mockEditorView),
        getWebviewByTitle: vi.fn<(title: RegExp) => Promise<unknown>>().mockResolvedValue(mockWebview),
    };
    const mockBrowser = {
        getWorkbench: vi.fn<() => Promise<unknown>>().mockResolvedValue(mockWorkbench),
        getWebviewByTitle: vi.fn<() => Promise<unknown>>().mockResolvedValue(mockWebview),
        waitUntil: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        $: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    };
    return { mockInputBox, mockEditorView, mockWorkbench, mockWebview, mockBrowser };
});

/** Creates the actor with the ability bound to the mocked WDIO handle (STC TC-03 step 1). */
function actorWithMockedBrowser() {
    engage(Cast.where((actor) => actor.whoCan(
        browseTheWebWithMockedSession(mocks.mockBrowser),
    )));
    return actorCalled('QA');
}

describe('TC-03: Screenplay Tasks with mock WDIO (UT)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockWorkbench.executeCommand.mockResolvedValue(mocks.mockInputBox);
        mocks.mockWorkbench.getWebviewByTitle.mockResolvedValue(mocks.mockWebview);
        mocks.mockBrowser.getWorkbench.mockResolvedValue(mocks.mockWorkbench);
        mocks.mockBrowser.getWebviewByTitle.mockResolvedValue(mocks.mockWebview);
        mocks.mockBrowser.$.mockResolvedValue({
            setValue: vi.fn(async () => undefined),
            click: vi.fn(async () => undefined),
        });
    });

    it('OpenEditor opens the file via the open-file flow, exactly once (STC step 2)', async () => {
        const actor = actorWithMockedBrowser();

        await actor.attemptsTo(OpenEditor('extension/src/extension.ts'));

        expect(mocks.mockWorkbench.executeCommand).toHaveBeenCalledTimes(1);
        expect(mocks.mockWorkbench.executeCommand).toHaveBeenCalledWith('workbench.action.files.openFile');
        expect(mocks.mockInputBox.setText).toHaveBeenCalledTimes(1);
        expect(mocks.mockInputBox.setText).toHaveBeenCalledWith('extension/src/extension.ts');
        expect(mocks.mockInputBox.confirm).toHaveBeenCalledTimes(1);
    });

    it('RunCommand executes the extension command exactly once (STC step 3)', async () => {
        const actor = actorWithMockedBrowser();

        await actor.attemptsTo(RunCommand('sdlcAgents.openAgenticChat'));

        expect(mocks.mockWorkbench.executeCommand).toHaveBeenCalledTimes(1);
        expect(mocks.mockWorkbench.executeCommand).toHaveBeenCalledWith('sdlcAgents.openAgenticChat');
    });

    it('OpenWorkspace waits until the workbench is ready (composition)', async () => {
        const actor = actorWithMockedBrowser();

        await actor.attemptsTo(OpenWorkspace());

        expect(mocks.mockBrowser.waitUntil).toHaveBeenCalledTimes(1);
    });

    it('OpenChatPanel triggers the real extension command (composition)', async () => {
        const actor = actorWithMockedBrowser();

        await actor.attemptsTo(OpenChatPanel());

        expect(mocks.mockWorkbench.executeCommand).toHaveBeenCalledWith('sdlcAgents.openAgenticChat');
    });

    it('SendChatMessage fills the chat input and sends via the webview (composition)', async () => {
        const actor = actorWithMockedBrowser();

        await actor.attemptsTo(SendChatMessage('Show status'));

        expect(mocks.mockWebview.open).toHaveBeenCalledTimes(1);
        expect(mocks.mockWebview.close).toHaveBeenCalledTimes(1);
        expect(mocks.mockBrowser.$).toHaveBeenCalledWith('.chat-textarea');
        expect(mocks.mockBrowser.$).toHaveBeenCalledWith('.send-button');
    });

    it('task descriptions are verb phrases (STC step 4 — BR-04/FSD UC-04 validation rules)', () => {
        expect(OpenEditor('extension/src/extension.ts').toString()).toContain('opens the editor at');
        expect(RunCommand('sdlcAgents.openAgenticChat').toString()).toContain('executes the command');
        expect(OpenWorkspace().toString()).toContain('opens the IDE workspace');
        expect(OpenChatPanel().toString()).toContain('opens the SDLC chat panel');
        expect(SendChatMessage('Show status').toString()).toContain('sends the chat message');
    });
});
