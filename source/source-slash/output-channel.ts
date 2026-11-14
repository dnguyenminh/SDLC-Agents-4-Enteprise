/**
 * OutputChannelLike — minimal surface of a VS Code OutputChannel.
 *
 * Defined separately so the slash module stays decoupled from the
 * `vscode` dependency (the extension host passes its real channel in).
 */

export interface OutputChannelLike {
  appendLine(value: string): void;
  append(value: string): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
}
