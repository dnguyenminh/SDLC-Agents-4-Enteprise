/**
 * execute_dynamic_tool argument wrapping/unwrapping (Base64ProxyService).
 */

/**
 * Unwrap execute_dynamic_tool call:
 * Extract nested toolName + arguments for proxy processing.
 */
export function unwrapDynamicTool(args: Record<string, unknown>): { toolName: string; innerArgs: Record<string, unknown> } | null {
  const toolName = (args.toolName ?? args.tool_name) as string | undefined;
  if (!toolName) return null;
  const innerArgs = (args.arguments ?? args.args ?? {}) as Record<string, unknown>;
  return { toolName, innerArgs };
}

/**
 * Wrap proxied inner args back into execute_dynamic_tool shape.
 */
export function wrapDynamicTool(originalArgs: Record<string, unknown>, proxiedInnerArgs: Record<string, unknown>): Record<string, unknown> {
  const newArgs = { ...originalArgs };
  if ("arguments" in originalArgs) {
    newArgs.arguments = proxiedInnerArgs;
  } else if ("args" in originalArgs) {
    newArgs.args = proxiedInnerArgs;
  }
  return newArgs;
}
