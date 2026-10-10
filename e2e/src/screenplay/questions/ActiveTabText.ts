// e2e/src/screenplay/questions/ActiveTabText.ts — UC-04 (FSD: Text.of(Editor.activeTab()))
//
// SPIKE-1 actual (verified against wdio-vscode-service 8.0.0
// dist/pageobjects/editor/EditorView.d.ts): editorView.getActiveTab() returns
// Promise<EditorTab | undefined>; EditorTab.getTitle() returns Promise<string>.
// Returns '' when no tab is active (safe default — no throw, per TDD §6.4).
import { Question } from '@serenity-js/core';
import { withWorkbench } from '../interactions/withWorkbench';

export const ActiveTabText = () =>
    Question.about('the text of the active editor tab', async (actor) => {
        const editorView = (await withWorkbench(actor)).getEditorView();
        const tab = await editorView.getActiveTab();
        return tab ? await tab.getTitle() : '';
    });
