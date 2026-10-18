/**
 * Shared mutable state for the PegaBrowserInspector collaborators (SA4E-95).
 * The single instance is owned by the facade class and passed by reference,
 * so browser/page refs and flags live in exactly ONE object.
 */

import type { Browser, Page } from "puppeteer-core";

/** Log function injected into every collaborator. */
export type LogFn = (msg: string) => void;

/** Mutable browser/session state shared by the facade and its collaborators. */
export interface InspectorState {
  browser: Browser | null;
  page: Page | null;
  userDataDir: string | null;
  isLoggedIn: boolean;
  /** True once the first field-cell popup HTML has been dumped for analysis. */
  fieldCellDumped: boolean;
}

/** Create the single shared state instance (called once by the facade). */
export function createInspectorState(): InspectorState {
  return { browser: null, page: null, userDataDir: null, isLoggedIn: false, fieldCellDumped: false };
}
