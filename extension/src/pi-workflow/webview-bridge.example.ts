/**
 * Example: Extension Host → Webview bridge for Pi Workflow state
 * Call this after PiWorkflowEngine.execute or on provider status change
 */

import * as vscode from 'vscode';

interface PiWorkflowWebviewMessage {
  type: 'PI_WORKFLOW_STATE_UPDATE';
  state: {
    sessionId: string;
    phase: string;
    providerStatus: 'connected' | 'disconnected' | 'connecting';
  };
}

export function sendPiWorkflowState(panel: vscode.WebviewPanel, engineState: {
  piSessionId?: string;
  currentPhase?: string;
  providerStatus?: 'connected' | 'disconnected' | 'connecting';
}) {
  const msg: PiWorkflowWebviewMessage = {
    type: 'PI_WORKFLOW_STATE_UPDATE',
    state: {
      sessionId: engineState.piSessionId ?? '',
      phase: engineState.currentPhase ?? '',
      providerStatus: engineState.providerStatus ?? 'disconnected',
    },
  };
  panel.webview.postMessage(msg);
}

// Usage example inside PiWorkflowEngine.execute
/*
async execute(input) {
  const output = await this.run(input);
  sendPiWorkflowState(this.webviewPanel, {
    piSessionId: output.pipelineState.piSessionId,
    currentPhase: output.pipelineState.currentPhase,
    providerStatus: 'connected',
  });
}
*/
