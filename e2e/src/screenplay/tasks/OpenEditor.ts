// e2e/src/screenplay/tasks/OpenEditor.ts — UC-04 (FSD: OpenEditor.at("path/to/file.ts"))
//
// SPIKE-1 actual (verified against wdio-vscode-service 8.0.0
// dist/pageobjects/editor/EditorView.d.ts): EditorView has NO `openFile(path)` method as
// sketched in TDD §6.3 — it opens editors by TAB TITLE (`openEditor(title)`). A file is
// opened by path through the `workbench.action.files.openFile` command, which surfaces an
// InputBox (workbench.executeCommand returns it) — setText(path) + confirm() completes the flow.
import { Interaction, Task } from '@serenity-js/core';
import { withWorkbench } from '../interactions/withWorkbench';

const OPEN_FILE_COMMAND = 'workbench.action.files.openFile';

/**
 * Low-level interaction: opens a file by path via the workbench open-file InputBox.
 */
const OpenFileEditor = (path: string) =>
    Interaction.where(`#actor enters ${path} into the open-file input`,
        async (actor) => {
            const workbench = await withWorkbench(actor);
            const inputBox = await workbench.executeCommand(OPEN_FILE_COMMAND);
            await inputBox.setText(path);
            await inputBox.confirm();
        },
    );

export const OpenEditor = (path: string) =>
    Task.where(`#actor opens the editor at ${path}`,
        OpenFileEditor(path),
    );
