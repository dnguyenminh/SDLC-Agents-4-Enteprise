/**
 * Field-path comparison utilities for the Pega round-trip validator.
 * Extracted from PegaRoundTripValidator (BR-18) — no behavior change.
 */

export function getFieldPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const fields: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      fields.push(...getFieldPaths(val as Record<string, unknown>, path));
    } else if (Array.isArray(val)) {
      fields.push(path);
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (item !== null && typeof item === 'object') {
          fields.push(...getFieldPaths(item as Record<string, unknown>, `${path}[${i}]`));
        }
      }
    } else {
      fields.push(path);
    }
  }
  return fields;
}

export function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arr = (current as Record<string, unknown>)[arrayMatch[1]];
      if (!Array.isArray(arr)) return undefined;
      current = arr[parseInt(arrayMatch[2], 10)];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(key => deepEqual(aObj[key], bObj[key]));
  }
  return a === b;
}
