/**
 * Project identity resolution for multi-tenant isolation (SA4E-241 SEC-01).
 * Extracted from extension.ts (BR-18 file-size limit) — same exported
 * functions, re-exported through the extension.ts façade.
 */

/** Project ID for multi-tenant isolation — derived from git remote or user+folder hash. */
let _projectId = "";
export function getProjectId(): string { return _projectId; }
export function setProjectId(id: string): void { _projectId = id; }

/**
 * SA4E-241 SEC-01: Require a resolved project identity — fail-closed.
 * The projectId is derived from the authenticated Pega application context
 * (setProjectId). We MUST NOT fall back to a shared default like 'PegaCollProj'
 * (cross-tenant leak). Callers that need a scope must have run context resolution
 * first (fetchAndSavePegaContext / catalog indexer).
 * @throws Error when no project identity has been resolved yet.
 */
export function requireProjectId(): string {
  if (!_projectId) {
    throw new Error(
      "No project identity resolved. Run 'Fetch Pega App Context' (or index) first — " +
      "SA4E-241 forbids a hard-coded default project (SEC-01).",
    );
  }
  return _projectId;
}

/**
 * Derive a stable project ID for multi-tenant isolation.
 * Priority: .code-intel/project.json -> git remote hash -> user+folder hash.
 * SRP: Extracted from initializeWorkspace to keep the main function focused.
 */
export async function deriveProjectId(workspaceRoot: string): Promise<string> {
  const pathModule = await import("path");
  const fs = await import("fs");
  const crypto = await import("crypto");
  const os = await import("os");
  const cp = await import("child_process");

  const codeIntelDir = pathModule.resolve(workspaceRoot, ".code-intel");
  const pjPath = pathModule.resolve(codeIntelDir, "project.json");

  // 1. Explicit config
  try {
    if (fs.existsSync(pjPath)) {
      const pj = JSON.parse(fs.readFileSync(pjPath, "utf-8"));
      if (pj.projectId) { return pj.projectId as string; }
    }
  } catch (err) {
    console.warn(`[Kiro] Could not read .code-intel/project.json: ${(err as Error).message}`);
  }

  // 2. Git remote hash
  let projectId: string;
  try {
    const remote = cp.execSync("git remote get-url origin", { cwd: workspaceRoot, encoding: "utf-8", timeout: 3000 }).trim();
    if (remote) { projectId = crypto.createHash("sha256").update(remote).digest("hex").slice(0, 12); }
    else { projectId = ""; }
  } catch {
    projectId = "";
  }
  // 3. User + folder hash (always succeeds)
  if (!projectId) {
    const userId = os.userInfo().username || "unknown";
    const folderName = pathModule.basename(workspaceRoot) || "workspace";
    // 3a. Add random UUID component to break user-to-project correlation
    const uuidComponent = crypto.randomUUID().slice(0, 8);
    projectId = crypto.createHash("sha256").update(`${userId}:${folderName}:${uuidComponent}`).digest("hex").slice(0, 12);
  }

  // NOTE (CRIT-2): project-id derivation must NOT depend on any auth secret.
  // JWT authentication is enforced server-side (fail-closed) in
  // backend/src/server/middleware/jwt-auth.ts (validateJwtConfig +
  // verifyHs256 keyed on KB_TOKEN_SECRET); the extension authenticates via
  // AuthManager bearer tokens. No client-side TOKEN_SECRET gate is required
  // here, and crashing activation is the wrong place to enforce it.

  // Persist derived project ID for stability across reloads
  try {
    if (!fs.existsSync(codeIntelDir)) { fs.mkdirSync(codeIntelDir, { recursive: true }); }
    fs.writeFileSync(pjPath, JSON.stringify({ projectId }, null, 2), "utf-8");
  } catch (err) {
    console.warn(`[Kiro] Could not write .code-intel/project.json: ${(err as Error).message}`);
  }

  return projectId;
}
