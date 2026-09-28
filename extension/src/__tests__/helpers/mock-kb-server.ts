/**
 * Mock Backend Knowledge Service HTTP server for integration tests.
 * Implements the real `/api/v1/threads*` REST contract from
 * backend/src/knowledge/routes.ts so tests exercise the actual HTTP path
 * of KnowledgeClient / RemoteCheckpointer (IT-HYD-03).
 */
import * as http from "http";
import * as crypto from "crypto";

export interface MockKbRequest {
  method: string;
  url: string;
  body: unknown;
}

export interface MockKbServer {
  url: string;
  port: number;
  threads: Array<Record<string, unknown>>;
  checkpoints: Map<string, Record<string, unknown>>;
  messagesByThread: Map<string, Array<Record<string, unknown>>>;
  requests: MockKbRequest[];
  close(): Promise<void>;
}

/** Start an embedded mock KB server on an ephemeral port. */
export function startMockKbServer(): Promise<MockKbServer> {
  const store = {
    threads: [] as Array<Record<string, unknown>>,
    checkpoints: new Map<string, Record<string, unknown>>(),
    messagesByThread: new Map<string, Array<Record<string, unknown>>>(),
    requests: [] as MockKbRequest[],
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let parsed: unknown = null;
      try { parsed = body ? JSON.parse(body) : null; } catch { /* keep null */ }
      store.requests.push({ method: req.method || "", url: req.url || "", body: parsed });

      const u = new URL(req.url || "/", "http://127.0.0.1");
      const json = (code: number, data: unknown, error: unknown = null) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data, error }));
      };

      // GET /api/v1/threads
      if (req.method === "GET" && u.pathname === "/api/v1/threads") {
        return json(200, store.threads);
      }

      // POST /api/v1/threads
      if (req.method === "POST" && u.pathname === "/api/v1/threads") {
        const p = (parsed ?? {}) as { title?: string; agent_id?: string | null };
        const thread = {
          thread_id: crypto.randomUUID(),
          workspace_id: "test-ws",
          title: p.title ?? "",
          agent_id: p.agent_id ?? null,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        store.threads.push(thread);
        return json(201, thread);
      }

      const cpMatch = u.pathname.match(/^\/api\/v1\/threads\/([^/]+)\/checkpoint$/);
      const msgMatch = u.pathname.match(/^\/api\/v1\/threads\/([^/]+)\/messages$/);
      const threadMatch = u.pathname.match(/^\/api\/v1\/threads\/([^/]+)$/);

      if (cpMatch) {
        const id = decodeURIComponent(cpMatch[1]);
        if (req.method === "GET") {
          const cp = store.checkpoints.get(id);
          if (!cp) { return json(404, null, { code: "THREAD_NOT_FOUND", message: "Thread not found" }); }
          return json(200, cp);
        }
        if (req.method === "PUT") {
          const prev = store.checkpoints.get(id) ?? {};
          const version = (prev.version as number) ?? 0;
          const cp: Record<string, unknown> = {
            thread_id: id,
            workspace_id: "test-ws",
            checkpoint: (parsed as { checkpoint?: unknown })?.checkpoint ?? null,
            metadata: (parsed as { metadata?: unknown })?.metadata ?? {},
            channel_versions: (parsed as { newVersions?: unknown })?.newVersions ?? {},
            pending_writes: (parsed as { pendingWrites?: unknown })?.pendingWrites ?? [],
            version: version + 1,
            updated_at: new Date().toISOString(),
          };
          store.checkpoints.set(id, cp);
          // Upsert thread row so listThreads() sees it (mirrors KnowledgeService)
          if (store.threads.findIndex((t) => t.thread_id === id) === -1) {
            store.threads.push({
              thread_id: id,
              workspace_id: "test-ws",
              title: "",
              agent_id: null,
              status: "active",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
          if ((parsed as { messages?: unknown })?.messages) {
            store.messagesByThread.set(id, (parsed as { messages: Array<Record<string, unknown>> }).messages);
          }
          return json(200, cp);
        }
      }

      if (msgMatch && req.method === "GET") {
        const id = decodeURIComponent(msgMatch[1]);
        if (!store.checkpoints.has(id) && store.threads.findIndex(t => t.thread_id === id) === -1) {
          return json(404, null, { code: "THREAD_NOT_FOUND", message: "Thread not found" });
        }
        return json(200, store.messagesByThread.get(id) ?? []);
      }

      if (threadMatch && req.method === "DELETE") {
        const id = decodeURIComponent(threadMatch[1]);
        const before = store.threads.length;
        store.threads = store.threads.filter(t => t.thread_id !== id);
        store.checkpoints.delete(id);
        store.messagesByThread.delete(id);
        if (store.threads.length === before && !store.checkpoints.has(id)) {
          return json(404, null, { code: "THREAD_NOT_FOUND", message: "Thread not found" });
        }
        return json(200, { deleted: true, thread_id: id });
      }

      return json(404, null, { code: "NOT_FOUND", message: `No route for ${req.method} ${u.pathname}` });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        threads: store.threads,
        checkpoints: store.checkpoints,
        messagesByThread: store.messagesByThread,
        requests: store.requests,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
