/**
 * ChatEngineAdapter dependency contracts (SA4E-85, DIP).
 * All concrete implementations hidden behind interfaces.
 */

import type { IMessageRouter } from '../../router/IMessageRouter';
import type { IPostMessageBridge } from '../../bridge/IPostMessageBridge';
import type { IContextManager } from '../../context/types';
import type { IToolHandler } from '../../tools/diffTypes';
import type { IStreamProtocolAdapter } from '../IStreamProtocolAdapter';
import type { ISessionManager } from '../ISessionManager';
import type { PiWorkflowAdapter } from '../../../pi-workflow';
import type { ToolApprovalGate } from '../ToolApprovalGate';
import type { CommandPatternMatcher } from '../CommandPatternMatcher';
import type { IDiffTracker } from '../../diff/IDiffTracker';

/**
 * Dependencies injected into ChatEngineAdapter (DIP).
 * All concrete implementations hidden behind interfaces.
 */
export interface ChatEngineAdapterDeps {
  router: IMessageRouter;
  bridge: IPostMessageBridge;
  engine: PiWorkflowAdapter;
  streamAdapter: IStreamProtocolAdapter;
  contextManager: IContextManager;
  toolHandler: IToolHandler;
  sessionManager: ISessionManager;
  approvalGate?: ToolApprovalGate;
  commandPatternMatcher?: CommandPatternMatcher;
  diffTracker?: IDiffTracker;
}
