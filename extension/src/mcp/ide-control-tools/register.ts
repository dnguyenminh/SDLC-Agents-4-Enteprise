/**
 * IdeControlTools — registers hidden MCP tools (ide_*) into the extension's
 * local tool registry so AI agents can control VSCode-like IDEs and perform
 * manual testing of extensions.
 *
 * Architecture (SA4E-352, user-approved): puppeteer-core drives the IDE via
 * CDP — no per-fork chromedriver binary needed (SA4E-344 spike evidence:
 * Kiro 1.2.37 CDP attach verified).
 *
 * Tools are hidden:true — executable + discoverable via find_tools, omitted
 * from tools/list (same convention as pega_* / devtools_* tools).
 *
 * OCP: mapping table — add a spec to CDP_TOOL_SPECS / CURRENT_IDE_TOOL_SPECS
 * to expose a new ide_ tool.
 */
import { registerLocalTool, LocalToolDefinition } from "../../backend-local-tools";
import { CDP_TOOL_SPECS } from "./cdp-tool-specs";
import { CURRENT_IDE_TOOL_SPECS } from "./current-tool-specs";
import { getManager } from "./manager";
import type { IdeHandler, IdeToolSpec } from "./types";

/** Registration order matches the original single mapping table. */
const IDE_TOOL_SPECS: IdeToolSpec[] = [...CDP_TOOL_SPECS, ...CURRENT_IDE_TOOL_SPECS];

function toDefinition(spec: IdeToolSpec): LocalToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    hidden: true,
  };
}

function toMcpResult(result: unknown): any {
  return {
    isError: false,
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

export function registerIdeControlTools(): number {
  getManager();
  for (const spec of IDE_TOOL_SPECS) {
    const bound: IdeHandler = (m, args) => spec.handler(m, args);
    const wrappedHandler = async (args: Record<string, unknown>) =>
      toMcpResult(await bound(getManager(), args));
    registerLocalTool(spec.name, wrappedHandler, toDefinition(spec));
  }
  return IDE_TOOL_SPECS.length;
}
