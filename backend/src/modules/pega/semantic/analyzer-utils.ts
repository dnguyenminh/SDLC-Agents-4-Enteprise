/** Shared helpers for the semantic analyzer impls (BR-18 extraction). */

export function extractName(json: Record<string, unknown>): string {
  return (json.pyRuleName as string)
    || (json.pyActivityName as string)
    || (json.pyModelName as string)
    || (json.pyFlowName as string)
    || (json.pyLabel as string)
    || '';
}

export function extractPropertyRefs(expr: string): string[] {
  const refs: string[] = [];
  const regex = /\.(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(expr)) !== null) {
    const prop = match[1];
    if (!prop.startsWith('py') && !prop.startsWith('px') && !refs.includes(prop)) {
      refs.push(prop);
    }
  }
  return refs;
}
