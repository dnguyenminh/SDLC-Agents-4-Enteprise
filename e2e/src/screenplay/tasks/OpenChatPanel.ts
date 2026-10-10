// e2e/src/screenplay/tasks/OpenChatPanel.ts — UC-05 (uses the real extension command
// "sdlcAgents.openAgenticChat" from extension/package.json activationEvents, TDD §6.3).
import { Interaction, Task } from '@serenity-js/core';
import { withWorkbench } from '../interactions/withWorkbench';

const OPEN_AGENTIC_CHAT_COMMAND = 'sdlcAgents.openAgenticChat';

/**
 * Low-level interaction: triggers the extension command that opens the SDLC chat panel.
 */
const OpenAgenticChatPanel = () =>
    Interaction.where(`#actor triggers the agentic chat command`,
        async (actor) => {
            const workbench = await withWorkbench(actor);
            await workbench.executeCommand(OPEN_AGENTIC_CHAT_COMMAND);
        },
    );

export const OpenChatPanel = () =>
    Task.where(`#actor opens the SDLC chat panel`,
        OpenAgenticChatPanel(),
    );
