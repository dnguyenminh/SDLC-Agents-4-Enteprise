// e2e/src/screenplay/tasks/OpenWorkspace.ts — UC-02/UC-04 (TDD §6.3)
// Composes the workbench-ready wait interaction (TDD §6.2: Task = sequence of activities).
import { Task } from '@serenity-js/core';
import { WaitUntilWorkbenchReady } from '../interactions/WaitUntilWorkbenchReady';

export const OpenWorkspace = () =>
    Task.where(`#actor opens the IDE workspace`,
        WaitUntilWorkbenchReady(),
    );
