import { describe, it, expect, beforeEach } from 'vitest';
import {
  PiWorkflowEngine,
  PiProvider,
  PhaseRouter,
  StateAdapter,
  CheckpointerAdapter,
  ApprovalAdapter,
  type PipelineState,
  type RemoteCheckpointerStore,
  type ToolApprovalGateHandler
} from '../index.js';

describe('PiWorkflow E2E Integration Suite (SA4E-297)', () => {
  let engine: PiWorkflowEngine;
  let checkpointsStore: Record<string, PipelineState>;
  let approvalAuditTrail: string[];

  beforeEach(async () => {
    checkpointsStore = {};
    approvalAuditTrail = [];

    const mockStore: RemoteCheckpointerStore = {
      async getCheckpoint(id) {
        return checkpointsStore[id] || null;
      },
      async saveCheckpoint(id, cp) {
        checkpointsStore[id] = cp;
      }
    };

    const mockGate: ToolApprovalGateHandler = {
      async requestApproval(req) {
        approvalAuditTrail.push(`Approved tool: ${req.toolName} (id: ${req.toolUseId})`);
        return { approved: true, reason: 'Passed QA validation' };
      }
    };

    engine = new PiWorkflowEngine({
      remoteStore: mockStore,
      gateHandler: mockGate
    });

    await engine.initialize('WebSocket');
  });

  it('TC-E2E-001: Complete SDLC pipeline lifecycle turn execution and phase transitions', async () => {
    // Step 1: Initialize PipelineState
    let state: PipelineState = {
      ticketKey: 'SA4E-297',
      threadId: 'th-e2e-001',
      currentPhase: 'requirements'
    };

    // Step 2: Execute BA Turn in Requirements phase
    const turn1 = await engine.executeTurn(state, 'Gather business requirements', 'ba-agent');
    expect(turn1.result.error).toBeUndefined();
    expect(turn1.nextState.currentAgentId).toBe('ba-agent');
    state = turn1.nextState;

    // Verify checkpoint after turn 1
    expect(checkpointsStore['th-e2e-001']).toBeDefined();
    expect(checkpointsStore['th-e2e-001'].currentAgentId).toBe('ba-agent');

    // Step 3: Transition Requirements -> Specification
    const transition1 = await engine.transitionPhase(state, { action: 'proceed' });
    expect(transition1.nextPhase).toBe('specification');
    state = transition1.nextState;

    // Step 4: Execute SA Turn in Specification phase
    const turn2 = await engine.executeTurn(state, 'Create technical design', 'sa-agent');
    expect(turn2.result.error).toBeUndefined();
    expect(turn2.nextState.currentAgentId).toBe('sa-agent');
    state = turn2.nextState;

    // Step 5: Transition Specification -> Design -> Test Planning -> Implementation -> Testing -> Deployment -> Completed
    const phases = ['design', 'test_planning', 'implementation', 'testing', 'deployment', 'completed'];
    for (const phase of phases) {
      const res = await engine.transitionPhase(state, { action: 'proceed' });
      expect(res.nextPhase).toBe(phase);
      state = res.nextState;
    }

    // Verify final persisted checkpoint
    expect(checkpointsStore['th-e2e-001'].currentPhase).toBe('completed');
  });

  it('TC-E2E-002: Tool approval and audit logging integration', async () => {
    const adapter = new ApprovalAdapter({
      async requestApproval(req) {
        approvalAuditTrail.push(`Audit: ${req.toolName}`);
        return { approved: true };
      }
    });

    const res = await adapter.processToolApproval(
      { tool_name: 'git_commit', arguments: { message: 'feat: add pi-workflow' } },
      { agentId: 'dev-agent', ticketKey: 'SA4E-297' }
    );

    expect(res.approved).toBe(true);
    expect(approvalAuditTrail).toContain('Audit: git_commit');
  });

  it('TC-E2E-003: Abort/Halt workflow transition handling', async () => {
    const state: PipelineState = {
      ticketKey: 'SA4E-297',
      threadId: 'th-e2e-003',
      currentPhase: 'implementation'
    };

    const res = await engine.transitionPhase(state, { action: 'abort', reason: 'Critical bug found in QA' });
    expect(res.nextPhase).toBe('implementation');
    expect(res.nextState.pipelineStatus).toBe('HALTED');
    expect(res.nextState.haltReason).toBe('Critical bug found in QA');
  });
});
