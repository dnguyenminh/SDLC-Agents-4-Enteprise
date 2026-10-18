/**
 * ChatPanelProvider — one-shot context-usage counters.
 * Owned by ChatPanelProvider and passed by reference into the extracted
 * context-usage helpers so both sides observe the same flags.
 */

export class CountedFlags {
  steeringCounted = false;
  toolDefinitionsCounted = false;
}
