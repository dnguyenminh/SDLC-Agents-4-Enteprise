/**
 * Token Refresh Logic — extracted from TokenManager (KSA-231)
 * SSO OIDC token refresh with retry logic.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import type { KiroCredentials, CredentialStatus } from "./token-manager";

interface RefreshCallbacks {
  setStatus: (status: CredentialStatus) => void;
  log: (level: string, message: string) => void;
  scheduleRefresh: () => void;
}

export async function refreshTokenWithRetry(
  credentials: KiroCredentials, callbacks: RefreshCallbacks
): Promise<boolean> {
  credentials.status = "refreshing";
  callbacks.setStatus("refreshing");
  callbacks.log("INFO", "Refreshing token (attempt 1/3)");

  let lastError: Error | null = null;
  const delays = [1000, 2000, 4000];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await callSsoOidc(credentials);
      if (result === "invalid_grant") {
        credentials.status = "expired";
        callbacks.setStatus("expired");
        callbacks.log("WARN", "Refresh token expired. Re-login required.");
        vscode.window.showWarningMessage("Kiro session expired. Please re-login.", "Open Kiro IDE");
        return false;
      }
      if (result) {
        credentials.accessToken = result.accessToken;
        credentials.refreshToken = result.refreshToken;
        credentials.expiresAt = new Date(Date.now() + result.expiresIn * 1000);
        credentials.status = "active";
        callbacks.setStatus("active");
        callbacks.log("INFO", `Token refreshed. Expires at ${credentials.expiresAt.toISOString()}`);
        writeBackToCache(credentials, callbacks.log);
        callbacks.scheduleRefresh();
        return true;
      }
    } catch (err) {
      lastError = err as Error;
      if (attempt < 2) {
        callbacks.log("WARN", `Refresh attempt ${attempt + 1}/3 failed: ${lastError.message}`);
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }

  callbacks.log("ERROR", `Token refresh failed after 3 attempts: ${lastError?.message}`);
  credentials.status = "expired";
  callbacks.setStatus("expired");
  vscode.window.showWarningMessage("Cannot refresh Kiro token. Check network.", "Retry");
  return false;
}

async function callSsoOidc(credentials: KiroCredentials): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | "invalid_grant"> {
  const response = await fetch(`https://oidc.${credentials.region}.amazonaws.com/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: credentials.clientId, clientSecret: credentials.clientSecret,
      grantType: "refresh_token", refreshToken: credentials.refreshToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 400) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (body.error === "invalid_grant") return "invalid_grant";
    throw new Error(`SSO OIDC 400: ${JSON.stringify(body)}`);
  }
  if (!response.ok) throw new Error(`SSO OIDC returned ${response.status}`);
  return await response.json() as { accessToken: string; refreshToken: string; expiresIn: number };
}

function writeBackToCache(credentials: KiroCredentials, log: (l: string, m: string) => void): void {
  try {
    const content = fs.readFileSync(credentials.sourceFile, "utf-8");
    const data = JSON.parse(content);
    data.accessToken = credentials.accessToken;
    data.refreshToken = credentials.refreshToken;
    data.expiresAt = credentials.expiresAt.toISOString();
    fs.writeFileSync(credentials.sourceFile, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    log("WARN", `Write-back failed: ${(err as Error).message}`);
  }
}
