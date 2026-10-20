/**
 * IndexerHttpClientCore — base segment of the IndexerHttpClient chain.
 * Holds auth/token state, header building, backend auto-registration
 * (SA4E-215) and workspace file reads. (Extracted from IndexerHttpClient.ts
 * for the BR-18 ≤200-lines-per-file rule; behavior unchanged.)
 */
import * as vscode from "vscode";
import * as path from "path";
import { getIndexerOutput } from "./state";

export class IndexerHttpClientCore {
    protected tokenRefresher?: () => Promise<string | undefined>;
    private onTokenRefreshed?: (token: string) => void;
    private lastRefreshedToken?: string;
    private _autoRegisterAttempted = false;

    constructor(protected readonly backendUrl: string) {}

    /** SA4E-99: Set token refresher callback — called on 401 to get a fresh token. */
    setTokenRefresher(refresher: () => Promise<string | undefined>): void {
        this.tokenRefresher = refresher;
    }

    /**
     * SA4E-300 GAP 3: Subscribe to refreshed tokens so long-lived callers
     * (IndexingService) can update their stored token. Optional — does not
     * change existing call signatures.
     */
    setOnTokenRefreshed(cb: (token: string) => void): void {
        this.onTokenRefreshed = cb;
    }

    /** SA4E-300 GAP 3: Last token obtained via refresh (undefined if never refreshed). */
    getCurrentToken(): string | undefined {
        return this.lastRefreshedToken;
    }

    protected notifyTokenRefreshed(token: string): void {
        this.lastRefreshedToken = token;
        try { this.onTokenRefreshed?.(token); } catch { /* non-fatal */ }
    }

	/** Expose backend base URL for other callers. */
	getBaseUrl(): string { return this.backendUrl; }

	/** SA4E-215: Auto-register project if backend reports PROJECT_NOT_REGISTERED. */
	protected async maybeAutoRegister(token?: string): Promise<boolean> {
		if (this._autoRegisterAttempted) return false;
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspaceFolder = workspaceFolders?.[0]?.uri.fsPath || '';
		const folderName = workspaceFolder ? path.basename(workspaceFolder) : 'unknown';
		const { getProjectId } = await import("../../extension");
		const projectId = getProjectId();
		if (!projectId) return false;
		const success = await this.registerProject(token, projectId, folderName, workspaceFolder);
		if (success) {
			this._autoRegisterAttempted = true;
		}
		// On failure, keep flag false to allow safe retry on next PROJECT_NOT_REGISTERED
		return success;
	}

	/** SA4E-215: POST the project registration (15s timeout); true only on 2xx. */
	private async registerProject(token: string | undefined, projectId: string, folderName: string, workspaceFolder: string): Promise<boolean> {
		try {
			const headers = await this.buildHeaders(token);
			const resp = await fetch(`${this.backendUrl}/api/admin/projects/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...headers },
				body: JSON.stringify({ projectId, displayName: folderName, workspacePath: workspaceFolder }),
				signal: AbortSignal.timeout(15000),
			});
			if (resp.ok) {
				getIndexerOutput().appendLine(`[IndexerHttpClient] Auto-registered project: ${projectId}`);
				return true;
			}
			return false;
		} catch (err) {
			getIndexerOutput().appendLine(`[IndexerHttpClient] Auto-register failed: ${(err as Error).message}`);
			return false;
		}
	}

    /** Build standard auth + project-id headers. */
    protected async buildHeaders(token: string | undefined): Promise<Record<string, string>> {
        const headers: Record<string, string> = {};
        if (token) { headers["Authorization"] = `Bearer ${token}`; }
        const { getProjectId } = await import("../../extension");
        const pid = getProjectId();
        if (pid) { headers["X-Project-Id"] = pid; }
        // Send workspace root so server registers correct display_name
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            headers["X-Workspace-Root"] = workspaceFolders[0].uri.fsPath;
        }
        // Client-requested rate limit (rpm). Server clamps this to its own hard cap,
        // so this can only lower (never raise) the effective limit above the server max.
        const rpm = vscode.workspace.getConfiguration("sdlcAgents").get<number>("backend.rateLimitRpm");
        if (typeof rpm === "number" && Number.isInteger(rpm) && rpm > 0) {
            headers["X-Rate-Limit-RPM"] = String(rpm);
        }
        return headers;
    }

    /** Read a workspace-relative file as UTF-8 text (undefined when unreadable). */
    protected async readFileContent(relPath: string): Promise<string | undefined> {
        try {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (root) {
                const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(root, relPath)));
                return Buffer.from(raw).toString("utf-8");
            }
        } catch (err) {
          getIndexerOutput().appendLine(`[IndexerHttpClient] readFileContent failed for '${relPath}': ${(err as Error).message}`);
        }
        return undefined;
    }
}
