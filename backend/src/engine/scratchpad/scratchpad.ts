/**
 * SA4E-421 — Scratchpad format (16K Doc §8): REQUIRED before each tool call.
 *
 *   <scratchpad>
 *   * Goal: [1-sentence objective]
 *   * DeadEnds: [file:lines -> reason not relevant]
 *   * Facts: [file:lines -> critical logic + code refs]
 *   * Plan: [next tool call + reason]
 *   </scratchpad>
 *
 * Evidence references use `evidence:<id>` / `chunk:<id>` tokens — these are
 * EXEMPT from context eviction (eviction.ts consumes referencedEvidenceIds()).
 */

export interface ScratchpadItem {
  location: string;
  note: string;
}

export interface Scratchpad {
  goal: string;
  deadEnds: ScratchpadItem[];
  facts: ScratchpadItem[];
  plan: string;
}

export class ScratchpadError extends Error {
  constructor(public readonly reason: string) {
    super(`SCRATCHPAD_REQUIRED: ${reason}`);
  }
}

const SECTIONS = ['Goal', 'DeadEnds', 'Facts', 'Plan'] as const;

function sectionValue(body: string, label: string): string | null {
  const re = new RegExp(`\\*\\s*${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\*\\s*(?:Goal|DeadEnds|Facts|Plan)\\s*:|</scratchpad>|$)`, 'i');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function parseItems(value: string | null): ScratchpadItem[] {
  if (!value) return [];
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const arrow = part.indexOf('->');
      if (arrow === -1) return { location: part, note: '' };
      return { location: part.slice(0, arrow).trim(), note: part.slice(arrow + 2).trim() };
    });
}

/** Parse a `<scratchpad>...</scratchpad>` block; throws when malformed. */
export function parseScratchpad(text: string): Scratchpad {
  const block = text.match(/<scratchpad>([\s\S]*?)<\/scratchpad>/i);
  if (!block) throw new ScratchpadError('block <scratchpad> ... </scratchpad> not found');
  const body = block[1];
  const missing = SECTIONS.filter((s) => sectionValue(body, s) === null);
  if (missing.length > 0) throw new ScratchpadError(`missing sections: ${missing.join(', ')}`);
  const goal = sectionValue(body, 'Goal') ?? '';
  if (goal.split(/[.!?]/).filter((s) => s.trim()).length > 1) {
    throw new ScratchpadError('Goal must be a single sentence');
  }
  return {
    goal,
    deadEnds: parseItems(sectionValue(body, 'DeadEnds')),
    facts: parseItems(sectionValue(body, 'Facts')),
    plan: sectionValue(body, 'Plan') ?? '',
  };
}

/** Render back to the canonical format (round-trip safe for parsed input). */
export function renderScratchpad(sp: Scratchpad): string {
  const items = (list: ScratchpadItem[]) =>
    list.length === 0 ? 'none' : list.map((i) => `${i.location} -> ${i.note}`).join('; ');
  return [
    '<scratchpad>',
    `* Goal: ${sp.goal}`,
    `* DeadEnds: ${items(sp.deadEnds)}`,
    `* Facts: ${items(sp.facts)}`,
    `* Plan: ${sp.plan}`,
    '</scratchpad>',
  ].join('\n');
}

export interface ScratchpadValidation {
  valid: boolean;
  errors: string[];
}

export function validateScratchpad(text: string): ScratchpadValidation {
  try {
    parseScratchpad(text);
    return { valid: true, errors: [] };
  } catch (err) {
    return { valid: false, errors: [String((err as Error).message)] };
  }
}

/**
 * Enforcement point for the agent loop: the assistant message immediately
 * preceding a tool call MUST end with a valid scratchpad block.
 */
export function assertScratchpadBeforeToolCall(assistantMessage: string): void {
  const tail = assistantMessage.trimEnd();
  if (!/<scratchpad>[\s\S]*?<\/scratchpad>\s*$/i.test(tail)) {
    throw new ScratchpadError('no scratchpad block at the end of the message preceding a tool call');
  }
  parseScratchpad(tail); // structural validation (sections + single-sentence goal)
}

/** Evidence IDs explicitly referenced in the scratchpad — eviction-exempt. */
export function referencedEvidenceIds(sp: Scratchpad | string): Set<string> {
  const text = typeof sp === 'string' ? sp : renderScratchpad(sp);
  const ids = new Set<string>();
  const re = /\b(?:evidence|chunk):([A-Za-z0-9._:-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.add(m[1]);
  return ids;
}
