import type { PiWorkflowState } from './types/pi-workflow-state';

export class WorkflowStateIO {
  constructor(private checkpointerAdapter: any, private webviewPanel: any, private pendingStates: PiWorkflowState[]) {}

  async persistWorkflowState(state: PiWorkflowState): Promise<void> {
    try {
      await this.checkpointerAdapter.save(state);
    } catch (e) {
      console.error('[PiWorkflowEngine] Checkpoint save failed', e);
      throw new Error(`ERR_CHECKPOINT_SAVE: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  sendPiWorkflowState(state: PiWorkflowState): void {
    if (!this.webviewPanel?.webview) {
      console.warn('[PiWorkflowEngine] WebviewPanel chưa bind, đưa state vào hàng đợi retry');
      this.pendingStates.push(state);
      if (this.pendingStates.length > 50) {
        this.pendingStates.shift();
        console.warn('[PiWorkflowEngine] Hàng đợi retry vượt quá 50');
      }
      return;
    }
    try {
      const providerStatus = state.pipelineStatus === 'error' ? 'disconnected' : 'connected';
      this.webviewPanel.webview.postMessage({ type: 'PI_WORKFLOW_STATE_UPDATE', state: { sessionId: state.piSessionId ?? '', phase: state.currentPhase ?? '', providerStatus } });
      console.log('[PiWorkflowEngine] Đã gửi PI_WORKFLOW_STATE_UPDATE');
    } catch (err) {
      console.error('[PiWorkflowEngine] Lỗi gửi PI_WORKFLOW_STATE_UPDATE tới webview:', err);
    }
  }
}
