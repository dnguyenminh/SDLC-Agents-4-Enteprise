/** SA4E-393 Addendum 5 — manifest contract of the worktree auto-trust setting (E2.3, E11.7). */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8"));

describe("sdlcAgents.workspace.worktreeAutoTrust", () => {
  const props = pkg.contributes.configuration.properties ?? {};
  it("is a machine-scoped boolean defaulting to true (a workspace file cannot enable it)", () => {
    expect(props["sdlcAgents.workspace.worktreeAutoTrust"]).toMatchObject({
      type: "boolean", default: true, scope: "machine",
    });
  });
});
