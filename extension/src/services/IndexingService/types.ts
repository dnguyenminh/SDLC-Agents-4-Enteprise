/**
 * IndexingService — shared option/progress types.
 */

import * as vscode from "vscode";

export interface IndexOptions {
    code: boolean;
    documents: boolean;
    sync: boolean;
    schemas: boolean;
    jira: boolean;
}

export type ProgressReporter = vscode.Progress<{ message?: string }>;
