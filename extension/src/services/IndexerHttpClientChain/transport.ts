/**
 * IndexerHttpClientTransport — HTTP primitives segment: single-attempt POST/GET
 * with token-refresh + auto-register retry flows, the boolean POST helper, and
 * the detailed-error POST used by the batch retry logic.
 * (Extracted from IndexerHttpClient.ts for BR-18; behavior unchanged.)
 */
import { httpPostJson as utilHttpPostJson } from "../../utils/http-client-utils";
import { getIndexerOutput, logHttpGetFailure } from "./state";
import { PostAttemptResult, PostDetailResult } from "./types";
import { IndexerHttpClientCore } from "./http-core";

export class IndexerHttpClientTransport extends IndexerHttpClientCore {
    /** Single POST attempt returning HTTP status + raw body (status 0 on network error). */
    private async httpPostJsonOnce(url: string, payload: unknown, token: string | undefined): Promise<PostAttemptResult> {
        const headers = await this.buildHeaders(token);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30000),
            });
            const body = await response.text();
            return { status: response.status, body };
        } catch (err) {
            getIndexerOutput().appendLine(`[IndexerHttpClient] httpPostJson failed (non-fatal): ${(err as Error).message}`);
            return { status: 0, body: "" };
        }
    }

    /** Single GET attempt returning HTTP status + raw body (status 0 on network error). */
    private async httpGetOnce(url: string, token: string | undefined): Promise<PostAttemptResult> {
        const headers = await this.buildHeaders(token);
        try {
            const response = await fetch(url, {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(30000),
            });
            const body = await response.text();
            return { status: response.status, body };
        } catch (err) {
            logHttpGetFailure(err);
            return { status: 0, body: "" };
        }
    }

    /** Simple POST returning boolean success. Delegates to http-client-utils. */
    private async httpPost(url: string, payload: unknown, token: string | undefined): Promise<boolean> {
        const headers = await this.buildHeaders(token);
        return utilHttpPostJson<unknown>(url, payload, { headers, timeoutMs: 30000 })
            .then(() => true)
            .catch(() => false);
    }

    private async uploadDocumentFile(relPath: string, content: string, token?: string): Promise<boolean> {
        return this.httpPost(`${this.backendUrl}/api/index/document`, { path: relPath, content }, token);
    }

	/** POST with detailed error info for user-facing error reporting.
	 * SA4E-300: on 2xx the parsed body is returned as `body` — the index
	 * endpoints report per-file disk-write failures INSIDE a 200 response
	 * ({written|indexed, rejected, rejectedReasons}), so callers must be able
	 * to read them (previously the body was discarded on success). */
	protected async httpPostWithDetail(url: string, payload: unknown, token: string | undefined): Promise<PostDetailResult> {
		const headers = await this.buildHeaders(token);
		try {
			const result = await utilHttpPostJson<any>(url, payload, { headers, timeoutMs: 60000 });
			return { ok: true, error: "", status: 200, body: result };
		} catch (err: any) {
			const status = err?.statusCode || err?.status || 0;
			const body = err?.body || {};
			const errorMsg = body?.error || err?.message || String(err);
			const details = body?.details;
			const action = body?.action;
			if (status === 401) return { ok: false, error: "Unauthorized", details, action, status: 401 };
			// SA4E-215: Auto-register project if not registered
			if (status === 404 && body?.__error?.error?.code === 'PROJECT_NOT_REGISTERED') {
				const retryResult = await this.retryPostAfterAutoRegister(url, payload, token, headers);
				if (retryResult) { return retryResult; }
			}
			// SA4E-300 GAP 3: widened from 200 → 500 chars so important details survive
			return { ok: false, error: String(errorMsg).slice(0, 500), details, action, status };
		}
	}

	/** SA4E-215: Retry a failed POST once after successful project auto-registration. */
	private async retryPostAfterAutoRegister(url: string, payload: unknown, token: string | undefined, headers: Record<string, string>): Promise<PostDetailResult | null> {
		const registered = await this.maybeAutoRegister(token);
		if (!registered) { return null; }
		// Retry original request
		try {
			const retryBody = await utilHttpPostJson<any>(url, payload, { headers, timeoutMs: 60000 });
			return { ok: true, error: "", status: 200, body: retryBody };
		} catch (retryErr: any) {
			const rStatus = retryErr?.statusCode || retryErr?.status || 0;
			const rBody = retryErr?.body || {};
			return { ok: false, error: String(rBody?.error || retryErr?.message || retryErr).slice(0, 500), details: rBody?.details, action: rBody?.action, status: rStatus };
		}
	}

    /**
     * POST JSON and return raw body + ok status. Uses fetch() (proxy-patched globally).
     * On 401, refreshes the token once (if a refresher is set) and retries — long
     * operations (e.g. Pega crawl of hundreds of rules) can outlive the JWT, so the
     * final sync POST must refresh rather than fail with Unauthorized.
     */
	protected async httpPostJson(url: string, payload: unknown, token: string | undefined): Promise<{ ok: boolean; body: string }> {
		const first = await this.httpPostJsonOnce(url, payload, token);
		// SA4E-215: Auto-register project if not registered
		if (first.status === 404 && first.body) {
			try {
				const body = JSON.parse(first.body);
				if (body?.__error?.error?.code === 'PROJECT_NOT_REGISTERED') {
					const retryResult = await this.retryPostJsonAfterRegister(url, payload, token);
					if (retryResult) { return retryResult; }
				}
			} catch { /* not JSON, proceed normally */ }
		}
		if (first.status !== 401 || !this.tokenRefresher) {
			return { ok: first.status >= 200 && first.status < 300, body: first.body };
		}
		return this.postJsonWithFreshToken(url, payload, first.body, this.tokenRefresher);
	}

	/** SA4E-215: Retry a JSON POST once after successful project auto-registration. */
	private async retryPostJsonAfterRegister(url: string, payload: unknown, token: string | undefined): Promise<{ ok: boolean; body: string } | null> {
		const registered = await this.maybeAutoRegister(token);
		if (!registered) { return null; }
		const retry = await this.httpPostJsonOnce(url, payload, token);
		return { ok: retry.status >= 200 && retry.status < 300, body: retry.body };
	}

	/** Token likely expired mid-operation — refresh once and retry the POST. */
	private async postJsonWithFreshToken(url: string, payload: unknown, staleBody: string, refresher: () => Promise<string | undefined>): Promise<{ ok: boolean; body: string }> {
		const freshToken = await refresher();
		if (!freshToken) { return { ok: false, body: staleBody }; }
		// SA4E-300 GAP 3: propagate refreshed token outward
		this.notifyTokenRefreshed(freshToken);
		const retry = await this.httpPostJsonOnce(url, payload, freshToken);
		return { ok: retry.status >= 200 && retry.status < 300, body: retry.body };
	}

    /**
     * GET request returning raw body + ok status. Uses fetch() (proxy-patched globally).
     * On 401, refreshes the token once (if a refresher is set) and retries — the
     * extension is responsible for keeping its JWT fresh against the remote backend.
     */
	protected async httpGet(url: string, token: string | undefined): Promise<{ ok: boolean; body: string }> {
		const first = await this.httpGetOnce(url, token);
		// SA4E-215: Auto-register project if not registered
		if (first.status === 404 && first.body) {
			try {
				const body = JSON.parse(first.body);
				if (body?.__error?.error?.code === 'PROJECT_NOT_REGISTERED') {
					const retryResult = await this.retryGetAfterRegister(url, token);
					if (retryResult) { return retryResult; }
				}
			} catch { /* not JSON, proceed normally */ }
		}
		if (first.status !== 401 || !this.tokenRefresher) {
			return { ok: first.status === 200, body: first.body };
		}
		return this.getWithFreshToken(url, first.body, this.tokenRefresher);
	}

	/** SA4E-215: Retry a GET once after successful project auto-registration. */
	private async retryGetAfterRegister(url: string, token: string | undefined): Promise<{ ok: boolean; body: string } | null> {
		const registered = await this.maybeAutoRegister(token);
		if (!registered) { return null; }
		const retry = await this.httpGetOnce(url, token);
		return { ok: retry.status === 200, body: retry.body };
	}

	/** Token likely expired — refresh once and retry the GET with the fresh token. */
	private async getWithFreshToken(url: string, staleBody: string, refresher: () => Promise<string | undefined>): Promise<{ ok: boolean; body: string }> {
		const freshToken = await refresher();
		if (!freshToken) { return { ok: false, body: staleBody }; }
		// SA4E-300 GAP 3: propagate refreshed token outward
		this.notifyTokenRefreshed(freshToken);
		const retry = await this.httpGetOnce(url, freshToken);
		return { ok: retry.status === 200, body: retry.body };
	}
}
