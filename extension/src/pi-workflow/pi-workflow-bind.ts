import { piWorkflowEngine } from './pi-workflow';
import type { PiWorkflowState } from './types/pi-workflow-state';

export function bindPiWorkflowEngineToPanel(panel: any) {
  (piWorkflowEngine as any)['webviewPanel'] = panel;
  console.log('[PiWorkflowEngine] WebviewPanel đã bind thành công');
  const pending = (piWorkflowEngine as any).pendingStates as PiWorkflowState[];
  if (pending && pending.length > 0) {
    console.log(`[PiWorkflowEngine] Đang flush ${pending.length} state chờ từ hàng đợi retry theo thứ tự`);
    for (const state of pending) {
      try {
        const providerStatus = state.pipelineStatus === 'error' ? 'disconnected' : 'connected';
        piWorkflowEngine['webviewPanel'].webview.postMessage({
          type: 'PI_WORKFLOW_STATE_UPDATE',
          state: {
            sessionId: state.piSessionId ?? '',
            phase: state.currentPhase ?? '',
            providerStatus,
          },
        });
        console.log('[PiWorkflowEngine] Flush state -> session:', state.piSessionId, 'phase:', state.currentPhase);
      } catch (err) {
        console.error('[PiWorkflowEngine] Lỗi flush state:', err);
      }
    }
    (piWorkflowEngine as any)['pendingStates'] = [];
    console.log('[PiWorkflowEngine] Đã flush xong hàng đợi retry');
  }
}
