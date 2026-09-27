/**
 * McpBridgeCaller — SA4E-332.
 * Thin adapter satisfying the search-provider McpCaller contract
 * (`callMcpWrapper`) via McpBridge.callTool. Promise<string> narrows
 * safely to Promise<unknown>; extractText() already handles strings.
 *
 * NOTE: intentionally NOT `implements McpCaller` via import — the kernel
 * must not depend on pi-agent (even type-only) so the madge 0-cycles
 * gate holds. Structural typing gives identical assignability.
 */
import type { McpBridge } from "./mcp-bridge";

export class McpBridgeCaller {
  constructor(private readonly bridge: McpBridge) {}
  callMcpWrapper(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    return this.bridge.callTool(toolName, params);
  }
}
