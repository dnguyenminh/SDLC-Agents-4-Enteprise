#!/usr/bin/env node
/**
 * scripts/uat/uat-drive.mjs — SA4E-369 UAT scripted E2E driver (Playwright + _electron)
 *
 * TARGET WINDOW (fix của lần chạy trước): workbench bottom panel tab "SDLC Chat"
 *   (view container sdlcChatContainer chứa webview sdlcChatPanel).
 *   ⛔ KHÔNG dùng 'SDLC Agents: Open Agentic Chat'.
 *
 * Phases:
 *   0  preflight  — kill stale UAT processes (Code/Kiro chỉ khi có flag
 *                   extension-development-path hoặc user-data-dir *uat-*),
 *                   write settings.json cho profile UAT, ensure stub :9599
 *   1  launch     — Code.exe qua Playwright _electron (fallback Kiro.exe)
 *   2  panel      — Ctrl+J -> click tab "SDLC Chat"; fallback palette
 *   3  frame      — tìm frame vscode-webview://, dump a11y snapshot
 *   4  turns      — đọc scenario.json, type message, click Approve/Deny, verify
 *   5  close      — đóng app, ghi results JSON + summary console
 *
 * Usage: node scripts/uat/uat-drive.mjs
 */
import { _electron } from "playwright";
import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EV = path.join(ROOT, "documents", "SA4E-369", "evidence");
const SNAP = path.join(EV, "uat-snapshots.txt");
const RESULTS_JSON = path.join(ROOT, "documents", "SA4E-369", "uat-run-results.json");
const SCENARIO = path.join(HERE, "scenario.json");

const CODE_EXE = "C:\\Users\\ASUS\\scoop\\apps\\vscode\\current\\Code.exe";
const KIRO_CANDIDATES = [
  "C:\\Users\\ASUS\\scoop\\apps\\kiro\\current\\Kiro.exe",
  "C:\\Users\\ASUS\\AppData\\Local\\Programs\\Kiro\\Kiro.exe",
  "C:\\Program Files\\Kiro\\Kiro.exe",
];
const UAT_PROFILE = path.join(os.tmpdir(), "opencode", "uat-vsc-pw");

const log = (...a) => console.log("[uat]", new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ------------------------------- Phase 0 -------------------------------- */

function cleanupStaleProcesses() {
  const ps1 = path.join(HERE, "_cleanup-uat.ps1");
  const script = [
    "= Kill ONLY processes launched for UAT (flagged). Never touch a bare user Kiro.exe.",
    "$flagged = Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -in @('Code.exe','Kiro.exe') -and (",
    "    ($_.CommandLine -like '*extension-development-path*') -or",
    "    ($_.CommandLine -like '*uat-*'))",
    "}",
    "foreach ($p in $flagged) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Output ('KILLED ' + $p.ProcessId + ' ' + $p.Name) } catch {} }",
    "Write-Output ('FLAGGED=' + @($flagged).Count)",
    "$oldStub = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*llm-stub.mjs*' }",
    "foreach ($p in $oldStub) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Output ('KILLED-STUB ' + $p.ProcessId) } catch {} }",
  ].join("\n");
  writeFileSync(ps1, script, "utf8");
  try {
    const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1 + '"', { encoding: "utf8", timeout: 30000 });
    log("phase0 cleanup:", out.trim().replace(/\n/g, " | "));
  } catch (e) {
    log("phase0 cleanup FAILED (continuing):", String(e).slice(0, 160));
  }
}

function writeSettings() {
  const userDir = path.join(UAT_PROFILE, "User");
  mkdirSync(userDir, { recursive: true });
  const settingsPath = path.join(userDir, "settings.json");
  let merged = {};
  try { merged = JSON.parse(readFileSync(settingsPath, "utf8")); } catch { /* fresh */ }
  merged["sdlcAgents.llmProvider"] = "openai";
  merged["sdlcAgents.openaiBaseUrl"] = "http://127.0.0.1:9599/v1";
  merged["sdlcAgents.llmModel"] = "stub-model-1";
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2), "utf8");
  log("phase0 settings written:", settingsPath);
}

async function stubHealthy() {
  try {
    const r = await fetch("http://127.0.0.1:9599/health", { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return false;
    const j = await r.json();
    return !!j.ok;
  } catch { return false; }
}

let stubChild = null;
async function ensureStub() {
  if (await stubHealthy()) { log("stub already UP on :9599"); return true; }
  stubChild = spawn(process.execPath, [path.join(HERE, "llm-stub.mjs")], { stdio: "ignore" });
  for (let i = 0; i < 20; i++) { await sleep(300); if (await stubHealthy()) { log("stub spawned & healthy"); return true; } }
  log("stub FAILED to start");
  return false;
}

/* ------------------------------- Phase 1 -------------------------------- */

async function launchApp() {
  const env = { ...process.env, OPENAI_API_KEY: "dummy-key-not-used" };
  const args = [
    "--extension-development-path=" + path.join(ROOT, "extension"),
    "--user-data-dir=" + UAT_PROFILE,
    "--disable-workspace-trust",
    "-n",
  ];
  const candidates = [CODE_EXE, ...KIRO_CANDIDATES].filter((p) => p && existsSync(p));
  log("launch candidates:", candidates.join(" ; "));
  let lastErr = null;
  for (const exe of candidates) {
    try {
      const app = await _electron.launch({ executablePath: exe, args, env, timeout: 120000 });
      const win = await app.firstWindow();
      log("launched:", exe, "title =", await win.title().catch(() => "?"));
      return { app, win, exe };
    } catch (e) {
      lastErr = e;
      log("launch FAILED for", path.basename(exe), ":", String(e).slice(0, 180));
    }
  }
  throw new Error("electron launch failed for all candidates. last=" + String(lastErr).slice(0, 300));
}

/* ------------------------------- Phase 2 -------------------------------- */

const TAB_SELECTORS = [
  '#workbench\\.parts\\.panel .composite-bar .tab[aria-label="SDLC Chat"]',
  '#workbench\\.parts\\.panel .tab[title="SDLC Chat"]',
  '.monaco-workbench .panel .composite-bar .tab:has-text("SDLC Chat")',
];

async function findChatTab(win) {
  for (const s of TAB_SELECTORS) {
    const l = win.locator(s).first();
    if (await l.isVisible().catch(() => false)) return l;
  }
  return null;
}

async function activateTab(win, tab) {
  await tab.click().catch(() => {});
  await win.waitForTimeout(1200);
}

async function openChatPanel(win) {
  // route A: Ctrl+J -> tab click
  await win.keyboard.press("Control+J").catch(() => {});
  await win.waitForTimeout(900);
  let tab = await findChatTab(win);
  if (tab) { await activateTab(win, tab); log("panel open (Ctrl+J route)"); return "ctrlJ"; }

  // route B: palette -> click quick-pick row containing "SDLC Chat" / "SDLC"
  await win.keyboard.press("Control+Shift+P").catch(() => {});
  await win.waitForTimeout(500);
  await win.keyboard.type("SDLC Chat");
  await win.waitForTimeout(700);
  const row = win.locator('.quick-input-list .monaco-list-row:has-text("SDLC Chat")').first();
  if (await row.isVisible().catch(() => false)) {
    await row.click().catch(() => {});
    await win.waitForTimeout(1500);
    await win.keyboard.press("Escape").catch(() => {});
    await win.waitForTimeout(400);
    tab = await findChatTab(win);
    if (tab) { await activateTab(win, tab); log("panel open (palette SDLC Chat route)"); return "palette"; }
  }
  await win.keyboard.press("Escape").catch(() => {});

  // route C: palette literal "Show Chat Panel" + Enter (per UAT-CHECKLIST)
  await win.keyboard.press("Control+Shift+P").catch(() => {});
  await win.waitForTimeout(500);
  await win.keyboard.type("Show Chat Panel");
  await win.waitForTimeout(600);
  await win.keyboard.press("Enter").catch(() => {});
  await win.waitForTimeout(2000);
  await win.keyboard.press("Escape").catch(() => {});
  tab = await findChatTab(win);
  if (tab) { await activateTab(win, tab); log("panel open (palette Show Chat Panel route)"); return "palette2"; }

  throw new Error("SDLC Chat tab not found after Ctrl+J + both palette routes");
}

/* ------------------------------- Phase 3 -------------------------------- */

function flatten(node, out) {
  if (!node || out.length > 6000) return out;
  if (node.name) out.push(node.name);
  if (node.value && node.value !== node.name) out.push(String(node.value));
  if (Array.isArray(node.children)) for (const c of node.children) flatten(c, out);
  return out;
}

async function a11ySnap(frame) {
  return frame.accessibility.snapshot().catch(() => null);
}

async function frameText(frame) {
  let t = "";
  try { t = await frame.locator("body").innerText({ timeout: 5000 }); } catch { /* dom not ready */ }
  if (t && t.trim().length > 20) return t.slice(0, 14000);
  const s = await a11ySnap(frame);
  if (s) return flatten(s, []).join(" | ").slice(0, 14000);
  return "";
}

async function dumpSnap(frame, label) {
  const s = await a11ySnap(frame);
  appendFileSync(SNAP, "\n=== " + label + " @ " + new Date().toISOString() + " url=" + frame.url().slice(0, 80) + " ===\n" + JSON.stringify(s, null, 1).slice(0, 5000) + "\n");
}

async function findChatFrame(win) {
  for (let i = 0; i < 30; i++) {
    const fr = win.frames().filter((f) => f.url().startsWith("vscode-webview://"));
    if (fr.length) {
      for (const f of fr) {
        const t = await frameText(f).catch(() => "");
        if (/chat|message|send|reply|input/i.test(t)) return { frame: f, total: fr.length };
      }
      return { frame: fr[fr.length - 1], total: fr.length };
    }
    await win.waitForTimeout(500);
  }
  throw new Error("no vscode-webview:// frame found after 15s");
}

/* ------------------------------- Phase 4 -------------------------------- */

async function findInput(frame) {
  const sels = ["textarea", 'input[type="text"]', '[contenteditable="true"]', '[role="textbox"]'];
  for (const s of sels) {
    const loc = frame.locator(s);
    const n = await loc.count().catch(() => 0);
    for (let i = n - 1; i >= 0; i--) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) return el;
    }
  }
  return null;
}

async function sendMessage(frame, text) {
  const input = await findInput(frame);
  if (!input) return { ok: false, method: "none" };
  try {
    await input.click({ timeout: 3000 });
    await input.fill("").catch(() => {});
    await input.pressSequentially(text, { delay: 10 });
    await input.press("Enter");
  } catch (e) {
    return { ok: false, method: "type-err:" + String(e).slice(0, 80) };
  }
  await frame.waitForTimeout(2500);
  return { ok: true, method: "enter" };
}

async function clickApproval(frame, win, kind) {
  const re = kind === "approve" ? /approve|allow/i : /deny|reject|block/i;
  let clicked = false;
  try {
    const btn = frame.locator('button, [role="button"]').filter({ hasText: re }).first();
    await btn.click({ timeout: 6000 });
    clicked = true;
  } catch { /* try workbench modal */ }
  if (!clicked) {
    try {
      const mb = win.locator('.monaco-dialog-box button, [role="dialog"] button').filter({ hasText: re }).first();
      await mb.click({ timeout: 2500 });
      clicked = true;
    } catch { /* nothing */ }
  }
  return clicked;
}

async function readBadge(win) {
  const sel = '#workbench\\.parts\\.panel .composite-bar .tab[aria-label="SDLC Chat"] .badge, #workbench\\.parts\\.panel .tab[title="SDLC Chat"] .badge';
  try {
    const b = win.locator(sel).first();
    if (await b.isVisible().catch(() => false)) return (await b.textContent() || "").trim();
    return "";
  } catch { return "?"; }
}

async function runTurn(win, frame, t, results) {
  const row = { id: t.id, sit: t.sit, group: t.group, status: "FAIL", method: "", expectFound: [], notes: [], tail: "" };
  log("---- turn", t.id, t.click ? "(click=" + t.click + ")" : "");
  try {
    const before = await frameText(frame);
    const sent = await sendMessage(frame, t.input);
    row.method = sent.method;
    if (!sent.ok) {
      row.status = "INFRA";
      row.notes.push("send failed: " + sent.method);
      results.push(row);
      log(t.id, "SEND-FAIL", sent.method);
      return row;
    }
    const checks = (t.expect || []).map((rx) => new RegExp(rx, "i"));
    const deadline = Date.now() + (t.waitMs || 8000);
    let text = before;
    while (Date.now() < deadline) {
      text = await frameText(frame);
      if (checks.some((r) => r.test(text))) break;
      if ((t.expect || []).length === 0 && text !== before) break;
      await win.waitForTimeout(400);
    }
    // user echo bubble sanity
    const head = escRe(t.input.replace(/\s+/g, " ").trim().slice(0, 20));
    row.userEcho = new RegExp(head, "i").test(text.replace(/\s+/g, " "));
    if (!row.userEcho) row.notes.push("user bubble echo not detected");

    if (t.click === "approve" || t.click === "deny") {
      const ok = await clickApproval(frame, win, t.click);
      row.notes.push("click " + t.click + (ok ? " OK" : " NOT-FOUND"));
      if (ok) { await win.waitForTimeout(2500); text = await frameText(frame); }
    }
    if (t.click === "timeout") { await win.waitForTimeout(30000); text = await frameText(frame); row.notes.push("waited 30s no interaction"); }

    if (t.hover) {
      try {
        const el = frame.locator('text=/B3 tooltip trigger/i').first();
        await el.hover({ timeout: 3000 });
        await win.waitForTimeout(700);
        text = await frameText(frame);
        const titled = await el.getAttribute("title").catch(() => null);
        if (titled) row.hoverTitle = titled;
        if (/inbound/i.test(text)) row.notes.push("tooltip/inbound text visible in frame");
      } catch (e) { row.notes.push("hover failed: " + String(e).slice(0, 80)); }
    }

    if (t.id === "SIT-05") {
      const badge = await readBadge(win);
      row.badgeAfterInbound = badge === "" ? "(none)" : badge;
      row.notes.push("panel-tab badge = " + row.badgeAfterInbound);
    }
    if (t.id === "SIT-09") {
      row.envelopeRenderedPlain = /PEER-BUS-ENVELOPE|X-SYSTEM-GRANT/i.test(text);
      row.notes.push("envelope text visible in " + (row.envelopeRenderedPlain ? "plain bubble" : "NO bubble"));
    }

    row.expectFound = checks.filter((r) => r.test(text)).map((r) => r.source);
    const all = checks.length;
    const found = row.expectFound.length;
    row.status = all === 0 ? "WARN" : found === all ? "PASS" : found > 0 ? "WARN" : "FAIL";
    if (all > 0 && row.expectFound.some((s) => /stub-agent/.test(s)) && !/stub-agent reply#\d/.test(text)) {
      row.notes.push("stub reply bubble not visible");
      if (row.status === "PASS") row.status = "WARN";
    }
    row.tail = text.slice(-700).replace(before.slice(0, 200), "");
  } catch (e) {
    row.status = "FAIL";
    row.notes.push("turn error: " + String(e).slice(0, 200));
  }
  results.push(row);
  const shot = path.join(EV, "uat-" + String(t.id).toLowerCase().replace(/[^a-z0-9-]/g, "") + ".png");
  try { await win.screenshot({ path: shot }); } catch (e) { row.notes.push("screenshot failed: " + String(e).slice(0, 80)); }
  await dumpSnap(frame, t.id + " status=" + row.status);
  log(t.id, "->", row.status, "| expect:", row.expectFound.join(","), "|", row.notes.join("; "));
  return row;
}

/* --------------------------------- main --------------------------------- */

async function main() {
  mkdirSync(EV, { recursive: true });
  const started = Date.now();
  log("SA4E-369 UAT driver start — target = bottom panel tab \"SDLC Chat\"");
  cleanupStaleProcesses();
  writeSettings();
  if (!(await ensureStub())) {
    const fail = [{ phase: "INFRA", status: "FAIL", notes: ["llm stub :9599 unavailable — no scripted evidence collected"] }];
    writeFileSync(RESULTS_JSON, JSON.stringify({ started, results: fail }, null, 2), "utf8");
    log("ABORT — stub unavailable. Results written with INFRA-FAIL.");
    process.exitCode = 0;
    return;
  }
  let app = null, win = null, frame = null, launchRoute = "?", panelRoute = "?";
  const results = [];
  try {
    ({ app, win } = await launchApp());            // phase 1
    launchRoute = "ok";
    await win.waitForTimeout(6000);                // workbench settle
    await win.screenshot({ path: path.join(EV, "uat-window-open.png") }).catch(() => {});
    log("window title:", await win.title().catch(() => "?"));

    panelRoute = await openChatPanel(win);         // phase 2
    await win.screenshot({ path: path.join(EV, "uat-panel-open.png") }).catch(() => {});
    log("panel opened via", panelRoute);

    const cf = await findChatFrame(win);           // phase 3
    frame = cf.frame;
    log("webview frame found", frame.url().slice(0, 60), "(of", cf.total, "vscode-webview frames)");
    await dumpSnap(frame, "PHASE3-panel-open");
    const snap0 = await frameText(frame);
    log("frame text length:", snap0.length);

    const scenario = JSON.parse(readFileSync(SCENARIO, "utf8"));  // phase 4
    for (const t of scenario.turns) await runTurn(win, frame, t, results);
    for (const s of scenario.skippedInScript) {
      results.push({ id: s.sit, status: "SKIP", notes: [s.reason] });
      log("SKIP", s.sit, "-", s.reason.slice(0, 10));
    }
  } catch (e) {
    log("FATAL:", String(e).slice(0, 400));
    results.push({ id: "INFRA", status: "FAIL", notes: ["fatal: " + String(e).slice(0, 250)] });
    try { await win?.screenshot({ path: path.join(EV, "uat-fatal.png") }); } catch { /* best effort */ }
  } finally {
    try { await app?.close(); } catch { /* ignore */ }
    try { if (stubChild) stubChild.kill(); } catch { /* ignore */ }
  }
  const out = { started: new Date(started).toISOString(), launchRoute, panelRoute, stub: "http://127.0.0.1:9599", results };
  writeFileSync(RESULTS_JSON, JSON.stringify(out, null, 2), "utf8");
  log("==== SUMMARY ====");
  for (const r of results) log(r.id, r.status, (r.notes || []).join(" ; "));
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  log("counts:", JSON.stringify(counts));
  log("results:", RESULTS_JSON);
}

main().catch((e) => { console.error("[uat] unhandled", e); process.exitCode = 1; });
