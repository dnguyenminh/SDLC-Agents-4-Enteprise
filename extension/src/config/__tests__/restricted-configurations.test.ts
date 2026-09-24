/**
 * SA4E-323 SEC-01 — package.json must restrict the workspace-scoped Pega/
 * Atlassian connection keys in untrusted workspaces.
 *
 * These keys are written to `.vscode/settings.json` (committable by a repo).
 * Listing them in capabilities.untrustedWorkspaces.restrictedConfigurations
 * makes VS Code ignore repo-supplied values while the workspace is untrusted,
 * closing the credential-redirection vector. This test guards against the list
 * silently losing an entry in future edits.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/** Load capabilities.untrustedWorkspaces.restrictedConfigurations from the manifest. */
function readRestrictedConfigurations(): string[] {
  const manifestPath = path.resolve(__dirname, "../../../package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const list = manifest?.capabilities?.untrustedWorkspaces?.restrictedConfigurations;
  return Array.isArray(list) ? list : [];
}

describe("restrictedConfigurations (SA4E-323 SEC-01)", () => {
  const restricted = readRestrictedConfigurations();

  it("restricts the three workspace-scoped connection keys", () => {
    expect(restricted).toContain("kiroSdlc.pegaEndpoint");
    expect(restricted).toContain("kiroSdlc.pegaUsername");
    expect(restricted).toContain("kiroSdlc.atlassianConnectionType");
  });

  it("keeps the pre-existing backend keys (no regression)", () => {
    expect(restricted).toContain("kiroSdlc.backend.url");
    expect(restricted).toContain("kiroSdlc.backend.allowInsecureRemote");
  });

  it("has no duplicate entries", () => {
    expect(new Set(restricted).size).toBe(restricted.length);
  });
});
