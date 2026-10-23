#!/usr/bin/env node
/**
 * scripts/uat/llm-stub.mjs — SA4E-369 UAT stub LLM (OpenAI-compatible, SSE streaming)
 *
 * Serve:   node scripts/uat/llm-stub.mjs      -> http://127.0.0.1:9599
 * Routes:  POST /v1/chat/completions (stream + non-stream), GET /health
 *
 * Reads scripts/uat/scenario.json on EVERY request (edit file = no restart).
 * Behavior by marker found in latest user message:
 *   [PEER_SEND:<tabId>]<msg>  -> tool_call peer_send {target:<tabId>, message:<msg>}
 *   [PEER_STATUS]<tabId?>     -> tool_call peer_status {target:<tabId?>}
 *   [APPROVE_TOOL]<path>      -> tool_call read_file {path:<path>}
 *   [INJECT]<payload>         -> assistant text "<injection_payload_refused_tbc>"
 *                                (payload stays in the input message; REPLY refuses)
 *   (default)                 -> assistant text "stub-agent reply#N"
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = 9599;
const HERE = path.dirname(fileURLToPath(import.meta.url));

let replyN = 0;
let callN = 0;
let reqSeq = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), "[stub]", ...a);

function scenario() {
  try { return JSON.parse(readFileSync(path.join(HERE, "scenario.json"), "utf8")); }
  catch (e) { return { __error: String(e).slice(0, 120) }; }
}

function lastUserText(messages) {
  const arr = Array.isArray(messages) ? messages : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    if (!m || m.role !== "user") continue;
    let c = m.content;
    if (Array.isArray(c)) c = c.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("\n");
    if (typeof c === "string") return c;
    try { return JSON.stringify(c); } catch { return ""; }
  }
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    if ((m?.role === "tool" || m?.role === "system") && typeof m.content === "string") return m.content;
  }
  return "";
}

function decide(text) {
  const t = text || "";
  let m;
  if ((m = t.match(/\[PEER_SEND:([A-Za-z0-9_.-]+)\]([\s\S]*)/))) {
    return { type: "tool", name: "peer_send", args: { target: m[1], message: m[2].replace(/\s+$/, "").slice(0, 2000) } };
  }
  if ((m = t.match(/\[PEER_STATUS\]\s*([^\n\r]*)/))) {
    const target = m[1].trim();
    return { type: "tool", name: "peer_status", args: target ? { target } : {} };
  }
  if ((m = t.match(/\[APPROVE_TOOL\]\s*([^\n\r]*)/))) {
    return { type: "tool", name: "read_file", args: { path: m[1].trim() } };
  }
  if (t.match(/\[INJECT\]/)) {
    return { type: "text", text: "<injection_payload_refused_tbc>" };
  }
  replyN += 1;
  return { type: "text", text: "stub-agent reply#" + replyN };
}

function chunkData(json) { return "data: " + JSON.stringify(json) + "\n\n"; }
function chunkBody(id, model, delta, finish) {
  return {
    id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, delta, finish_reason: finish ?? null }],
  };
}

async function streamText(res, id, model, text) {
  res.write(chunkData(chunkBody(id, model, { role: "assistant", content: "" }, null)));
  const pieces = text.match(/[\s\S]{1,24}/g) || [];
  for (const p of pieces) {
    res.write(chunkData(chunkBody(id, model, { content: p }, null)));
    await sleep(25);
  }
  res.write(chunkData(chunkBody(id, model, {}, "stop")));
  res.write("data: [DONE]\n\n");
}

async function streamTool(res, id, model, name, args) {
  callN += 1;
  res.write(chunkData(chunkBody(id, model, {
    role: "assistant",
    tool_calls: [{ index: 0, id: "call_uat" + callN, type: "function", function: { name, arguments: "" } }],
  }, null)));
  await sleep(40);
  res.write(chunkData(chunkBody(id, model, {
    tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }],
  }, null)));
  await sleep(30);
  res.write(chunkData(chunkBody(id, model, {}, "tool_calls")));
  res.write("data: [DONE]\n\n");
}

async function handleCompletions(bodyStr, res) {
  let body;
  try { body = JSON.parse(bodyStr || "{}"); } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "invalid json body" } }));
    return;
  }
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const userText = lastUserText(msgs);
  const beh = decide(userText);
  const model = body.model || "stub-model-1";
  reqSeq += 1;
  const id = "chatcmpl-uat-" + Date.now() + "-" + reqSeq;
  log("req#" + reqSeq, "behavior=" + beh.type + (beh.type === "tool" ? ":" + beh.name : ""), "stream=" + !!body.stream, "userLen=" + userText.length);

  if (body.stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });
    if (beh.type === "text") await streamText(res, id, model, beh.text);
    else await streamTool(res, id, model, beh.name, beh.args);
    res.end();
    return;
  }

  const msg = beh.type === "tool"
    ? { role: "assistant", content: null, tool_calls: [{ id: "call_uat" + (++callN), type: "function", function: { name: beh.name, arguments: JSON.stringify(beh.args) } }] }
    : { role: "assistant", content: beh.text };
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({
    id, object: "chat.completion", created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, message: msg, finish_reason: beh.type === "tool" ? "tool_calls" : "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });
      res.end();
      return;
    }
    if (req.method === "GET" && /\/health/.test(req.url)) {
      const sc = scenario();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, replies: replyN, calls: callN, scenarioOk: !sc.__error, model: "stub-model-1" }));
      return;
    }
    if (req.method === "POST" && /\/chat\/completions$/.test(req.url)) {
      let b = "";
      for await (const c of req) b += c;
      await handleCompletions(b, res);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "no route " + req.method + " " + req.url } }));
  } catch (e) {
    log("ERROR", String(e).slice(0, 200));
    try {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: String(e).slice(0, 200) } }));
    } catch { /* socket gone */ }
  }
});

server.listen(PORT, "127.0.0.1", () => log("UP http://127.0.0.1:" + PORT + "/v1/chat/completions pid=" + process.pid));
server.on("error", (e) => { log("LISTEN-ERROR", String(e).slice(0, 200)); process.exit(1); });
