// e2e/src/screenplay/tasks/RunCommand.ts — UC-04 (extension commands, TDD §6.3)
// workbench.executeCommand is the verified wdio-vscode-service page-object API (SPIKE-1).
import { Interaction, Task } from '@serenity-js/core';
import { withWorkbench } from '../interactions/withWorkbench';

/**
 * Low-level interaction: executes a command inside the IDE workbench.
 */
const ExecuteWorkbenchCommand = (command: string) =>
    Interaction.where(`#actor executes workbench command "${command}"`,
        async (actor) => {
            const workbench = await withWorkbench(actor);
            await workbench.executeCommand(command);
        },
    );

export const RunCommand = (command: string) =>
    Task.where(`#actor executes the command "${command}"`,
        ExecuteWorkbenchCommand(command),
    );
