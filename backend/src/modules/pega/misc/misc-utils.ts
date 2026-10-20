/** Shared name extraction for misc rule parsers (BR-18 extraction). */
export function extractMiscName(json: Record<string, unknown>): string {
  return (json.pyRuleName as string)
    || (json.pyName as string)
    || (json.pyLabel as string)
    || '';
}

