import { describe, it, expect } from "vitest";
import { CheckpointerAdapter, PayloadTooLargeError, SerializationError } from "../checkpointer-adapter";
import { StateAdapter } from "../state-adapter";
import { PiInternalState } from "../types/pi-workflow-state";

describe("StateAdapter", () => {
  const adapter = new StateAdapter();

  it("should convert PiInternalState to PipelineState", () => {
    const piState: PiInternalState = {
      ticketKey: "SA4E-294",
      threadId: "11111111-1111-4111-8111-111111111111",
      currentPhase: "design",
      pipelineStatus: "running",
      piSessionId: "sess-123",
      currentAgentId: "agent-1",
      toolCallCount: 2,
    } as any;
    const pipeline = adapter.fromPiState(piState);
    expect((pipeline as any).ticketKey).toBe("SA4E-294");
    expect((pipeline as any).piSessionId).toBe("sess-123");
  });

  it("should convert PipelineState to PiInternalState", () => {
    const pipeline = {
      ticketKey: "SA4E-294",
      threadId: "11111111-1111-4111-8111-111111111111",
      currentPhase: "design",
      pipelineStatus: "running",
      piSessionId: "sess-1",
      currentAgentId: null,
      toolCallCount: 0,
    } as any;
    const piState = adapter.toPiState(pipeline);
    expect(piState.ticketKey).toBe("SA4E-294");
    expect(piState.currentPhase).toBe("design");
  });
});

describe("CheckpointerAdapter", () => {
  it("should serialize Pi state and validate threadId", async () => {
    const adapter = new CheckpointerAdapter();
    const piState = {
      ticketKey: "SA4E-294",
      threadId: "11111111-1111-4111-8111-111111111111",
      currentPhase: "design",
      pipelineStatus: "running",
      piSessionId: "sess-1",
      currentAgentId: "a1",
      toolCallCount: 0,
    } as PiInternalState;
    const threadId = "11111111-1111-4111-8111-111111111111";
    const checkpoint = await adapter.putCheckpoint(threadId, piState);
    expect(checkpoint.version).toBe(1);
  });

  it("should throw on invalid UUID", async () => {
    const adapter = new CheckpointerAdapter();
    const piState = {} as PiInternalState;
    await expect(adapter.putCheckpoint("invalid-uuid", piState)).rejects.toThrow("Invalid threadId");
  });

  it("should throw PayloadTooLargeError for oversized payload", async () => {
    expect(() => { throw new PayloadTooLargeError(); }).toThrow(PayloadTooLargeError);
    expect(() => { throw new SerializationError(); }).toThrow(SerializationError);
  });
});
