# Jira Ticket Spec — PeerBus v2 (chờ tạo khi Jira MCP phục hồi)

## Ticket Info
- **Project**: SA4E
- **Type**: Story
- **Summary**: PeerBus v2: Approval Granularity + Peer Discovery + pi-intercom Patterns
- **Priority**: Medium
- **Labels**: peerbus, enhancement, agent-communication, v2

## Description

PeerBus v2 enhancement based on SA4E-369 learnings and pi-intercom comparison (https://pi.dev/packages/pi-intercom).

### High Priority Features

1. **Approval Granularity**: Add approve-all scopes (session/workspace/global) to reduce approval friction
   - Settings: `sdlcAgents.peerApprovalMode: "per-call" | "session" | "workspace" | "global"`
   - UI: [Approve] [Deny] [Approve all from this agent (session)] [Settings...]
   - Audit log for every auto-approve

2. **Peer Discovery Enhancement**: Auto-inject peer list into agent system prompt
   - Extension injects "Available peer agents: [list]" at session creation
   - AGENTS.md snippet for teaching agents when to coordinate

3. **Send vs Ask Mode Separation**: Two modes for peer_send
   - `send` = fire-and-forget (returns immediately)
   - `ask` = blocking, waits for reply (like pi-intercom ask)

### Medium Priority Features

4. **Reply Hints**: Incoming peer messages include "To reply, use peer_send(target=X, ...)" hint
5. **Handover Workflow**: Session summary transfer between agents
6. **Attachments**: peer_send supports file/snippet attachments

### Low Priority Features

7. **Inbound Trigger Config**: `always` / `replies` / `never` - control when peer messages trigger turns
8. **Message Cancel/Pending**: Cancel sent messages, list pending asks
9. **Session Naming**: Alias system for peer identification

### Security Requirements

- Maintain Option A fail-closed as default
- All new approval scopes must have clear opt-in and audit logging
- Anti-injection defenses from SA4E-369 must be preserved (envelope markers, forgery detection, rate limits)

### Reference

- SA4E-369: PeerBus v1 (Option A implementation, 103 tests, security review PASS, pentest 5/6 SAFE)
- pi-intercom v0.17.1: https://pi.dev/packages/pi-intercom

---
*Tạo ticket này qua Jira UI hoặc MCP khi server phục hồi. File này chứa đầy đủ nội dung ticket.*
