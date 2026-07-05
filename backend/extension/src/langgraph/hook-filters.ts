/**
 * Hook validation and filtering --- KSA-249
 * Schema validation and event-type filtering for hook definitions.
 */

import type { HookDefinition, HookTrigger, HookAction } from "./hook-loader";

const VALID_EVENT_TYPES: HookTrigger["type"][] = [
  "promptSubmit", "agentStop", "preToolUse", "postToolUse",
  "fileEdited", "fileCreated", "fileDeleted", "userTriggered",
  "preTaskExecution", "postTaskExecution",
];

const VALID_ACTION_TYPES: HookAction["type"][] = ["askAgent", "runCommand"];

export interface HookValidationError {
  file: string;
  field: string;
  message: string;
}

export function validateHookSchema(parsed: unknown, fileName: string): HookValidationError[] {
  const errors: HookValidationError[] = [];
  const obj = parsed as Record<string, unknown>;
  if (!obj || typeof obj !== "object") {
    errors.push({ file: fileName, field: "root", message: "Hook must be a JSON object" });
    return errors;
  }
  if (!obj.name || typeof obj.name !== "string" || (obj.name as string).trim().length === 0) {
    errors.push({ file: fileName, field: "name", message: "Required non-empty string" });
  }
  if (!obj.version || typeof obj.version !== "string") {
    errors.push({ file: fileName, field: "version", message: "Required non-empty string" });
  }
  if (!obj.when || typeof obj.when !== "object") {
    errors.push({ file: fileName, field: "when", message: "Required object" });
  } else {
    const when = obj.when as Record<string, unknown>;
    if (!when.type || !VALID_EVENT_TYPES.includes(when.type as HookTrigger["type"])) {
      errors.push({ file: fileName, field: "when.type", message: `Must be one of: ${VALID_EVENT_TYPES.join(", ")}` });
    }
  }
  if (!obj.then || typeof obj.then !== "object") {
    errors.push({ file: fileName, field: "then", message: "Required object" });
  } else {
    const then = obj.then as Record<string, unknown>;
    if (!then.type || !VALID_ACTION_TYPES.includes(then.type as HookAction["type"])) {
      errors.push({ file: fileName, field: "then.type", message: `Must be one of: ${VALID_ACTION_TYPES.join(", ")}` });
    } else if (then.type === "askAgent" && (!then.prompt || typeof then.prompt !== "string")) {
      errors.push({ file: fileName, field: "then.prompt", message: "Required for askAgent action" });
    } else if (then.type === "runCommand" && (!then.command || typeof then.command !== "string")) {
      errors.push({ file: fileName, field: "then.command", message: "Required for runCommand action" });
    }
  }
  return errors;
}

export function filterHooksByType(hooks: HookDefinition[], eventType: string): HookDefinition[] {
  return hooks.filter(h => h.when.type === eventType);
}

export function filterPreToolUseHooks(hooks: HookDefinition[], toolCategory: string): HookDefinition[] {
  return hooks.filter(h => {
    if (h.when.type !== "preToolUse") return false;
    if (!h.when.toolTypes) return false;
    return h.when.toolTypes.some(pattern => {
      if (pattern === "*" || pattern === toolCategory) return true;
      try { return new RegExp(pattern).test(toolCategory); } catch { return false; }
    });
  });
}

export function filterFileHooks(
  hooks: HookDefinition[],
  eventType: "fileEdited" | "fileCreated" | "fileDeleted",
  filePath: string
): HookDefinition[] {
  return hooks.filter(h => {
    if (h.when.type !== eventType) return false;
    if (!h.when.patterns) return true;
    return h.when.patterns.some(pattern => matchGlob(pattern, filePath));
  });
}

function matchGlob(pattern: string, filePath: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*");
  try {
    return new RegExp(`^${regex}$`).test(filePath) || new RegExp(regex).test(filePath);
  } catch { return false; }
}
