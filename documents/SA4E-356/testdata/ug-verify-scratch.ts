/**
 * QA scratch — VERIFY UG.md (SA4E-356) bằng cách THỰC HÀNH qua code thật.
 * Practice: UG §3.1 rules 1-8, §5.1 outputs, §7.2 Formats. Delete after run.
 */
import { resolveWorkspacePath } from "../../../extension/src/services/PathResolver";
import { executeLocalTool } from "../../../extension/src/backend-local-tools";
import * as fs from "fs";
import * as path from "path";

const WS = "C:\\projects\\kiro\\SDLC-Agents-4-Enterprise";
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} — ${detail ?? ""}`); }
}

// §3.1 Rule 6 — relative path khi KHÔNG mở workspace (node = cwd_fallback)
console.log("[Rule 6] relative + no workspace:");
const r6 = resolveWorkspacePath("documents/SA4E-356/notes.md");
check("code PATH_NO_WORKSPACE", !r6.ok && r6.code === "PATH_NO_WORKSPACE", JSON.stringify(r6).slice(0, 200));
check("Format 3 message matches UG", !r6.ok && r6.message.startsWith("PATH_NO_WORKSPACE: no workspace open — use an absolute path inside the intended folder or open a workspace. (got relative '"));

// §3.1 Rule 1 — relative path khi CÓ workspace (rootProvider giả lập)
console.log("[Rule 1] relative + workspace:");
const r1 = resolveWorkspacePath("documents/SA4E-356/notes.md", { rootProvider: () => WS });
check("resolves under workspace root", r1.ok && r1.resolvedPath === WS + "\\documents\\SA4E-356\\notes.md", JSON.stringify(r1).slice(0, 200));
check("rootSource=workspace", r1.ok && r1.rootSource === "workspace");

// §3.1 Rule 3 — ../ escape bị chặn
console.log("[Rule 3] ../ escape:");
const r3 = resolveWorkspacePath("../../outside.txt", { rootProvider: () => WS });
check("PATH_REJECTED_OUTSIDE_WORKSPACE", !r3.ok && r3.code === "PATH_REJECTED_OUTSIDE_WORKSPACE");
check("Format 2 message", !r3.ok && r3.message === `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: ../../outside.txt resolves to ${path.resolve(WS, "..", "..", "outside.txt")} — outside workspace root ${WS}.`);

// §3.1 Rule 4 — absolute ngoài root bị chặn
console.log("[Rule 4] absolute outside root:");
const r4 = resolveWorkspacePath("C:\\Windows\\evil.md", { rootProvider: () => WS });
check("absolute outside blocked", !r4.ok && r4.code === "PATH_REJECTED_OUTSIDE_WORKSPACE");

// §3.1 Rule 5 — case-fold win32
console.log("[Rule 5] case-insensitive win32:");
const r5 = resolveWorkspacePath("documents\\SA4E-356\\notes.md", { rootProvider: () => "c:" + WS.slice(2) });
check("drive letter case-fold pass", r5.ok);

// §3.1 Rule 7 — absolute passthrough khi không workspace
console.log("[Rule 7] absolute passthrough no workspace:");
const r7 = resolveWorkspacePath(WS + "\\scratch-ug.md");
check("passthrough ok (cwd_fallback)", r7.ok && r7.rootSource === "cwd_fallback" && r7.resolvedPath === WS + "\\scratch-ug.md");

// §3.1 Rule 8 — empty / NUL
console.log("[Rule 8] empty + NUL:");
const r8a = resolveWorkspacePath("");
const r8b = resolveWorkspacePath("a\0b");
check("PATH_EMPTY", !r8a.ok && r8a.code === "PATH_EMPTY" && r8a.message === "PATH_EMPTY: 'file_path' must be a non-empty string.");
check("PATH_INVALID", !r8b.ok && r8b.code === "PATH_INVALID" && r8b.message === "PATH_INVALID: 'file_path' contains invalid characters (NUL byte).");

const W = async (args: Record<string, unknown>) => await executeLocalTool("stream_write_file", args);

async function main() {
// §5.1 — THỰC HÀNH stream_write_file qua handler thật (relative → PATH_NO_WORKSPACE)
console.log("[§5.1 practice] executeLocalTool('stream_write_file'):");
const t1 = await W({ file_path: "documents/SA4E-356/notes.md", content: "# Notes" });
check("relative → PATH_NO_WORKSPACE (fail-loud, KHÔNG ghi file)", t1.isError === true && t1.content[0].text.startsWith("PATH_NO_WORKSPACE:"));

// §5.1 — absolute write + append (scratch file, xoá sau)
const scratch = WS + "\\documents\\SA4E-356\\ug-verify-scratch.md";
const t2 = await W({ file_path: scratch, content: "# Notes\nHello" });
check("Wrote file: message", !t2.isError && t2.content[0].text === `Wrote file: ${scratch}`, t2.content[0].text);
const t3 = await W({ file_path: scratch, content: "More", mode: "append" });
check("Appended to: message", !t3.isError && t3.content[0].text === `Appended to: ${scratch}`, t3.content[0].text);
const t4 = await W({ file_path: scratch });
check("'file_path' and 'content' required.", t4.isError && t4.content[0].text === "'file_path' and 'content' required.");
// §5.2 practice — file không tồn tại (resolve OK, ENOENT lúc ĐỌC) → Format 1
// (stream_write_file có content sẽ TẠO file — dùng embed_image (đọc) để gặp ENOENT)
const t5 = await executeLocalTool("embed_image", { file_path: WS + "\\documents\\SA4E-356\\no-such-file.md" });
// node = cwd_fallback → Format 1 variant 2 (UG §7.2 "Variant không mở workspace")
check("FILE_NOT_FOUND Format 1 (fallback variant, byte-exact UG §7.2)", t5.isError && t5.content[0].text === `FILE_NOT_FOUND: File not found: ${WS}\\documents\\SA4E-356\\no-such-file.md. Resolved against process.cwd() fallback = ${WS}. Gợi ý: mở workspace hoặc dùng absolute path trong workspace root.`, t5.content[0].text);
fs.rmSync(scratch, { force: true });
fs.rmSync(WS + "\\documents\\SA4E-356\\no-such-file.md", { force: true });
fs.rmSync(WS + "\\documents\\SA4E-356\\no-such-file-embedded.md", { force: true });
}

main().then(() => {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
});
