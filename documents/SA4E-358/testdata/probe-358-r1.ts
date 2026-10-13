/** One-off: PT-51 detail — absolute-form malformed request-target vs Node 24 llhttp (SA358-R1 live probe, boots its own server). */
import * as net from "net";
import * as Module from "module";

async function main(): Promise<void> {
  const vscodeStub = { OutputChannel: class {}, window: {}, workspace: {} };
  const origLoad = (Module as unknown as { _load: Function })._load;
  (Module as unknown as { _load: Function })._load = function (request: string, ...rest: unknown[]) {
    if (request === "vscode") return vscodeStub;
    return origLoad.call(this, request, ...rest);
  } as typeof Module._load;

  const rejections: string[] = [];
  process.on("unhandledRejection", (err) => { rejections.push(String((err as Error)?.message ?? err)); });

  const { WrapperServer } = await import("../../../extension/src/services/WrapperServer");
  const { Base64ProxyService } = await import("../../../extension/src/services/Base64ProxyService");
  const ws = new WrapperServer({
    outputChannel: { appendLine: () => {} } as never,
    base64Proxy: new Base64ProxyService(process.cwd()),
    restGetTools: async () => [],
    restCallTool: async () => ({ content: [] }),
  });
  await ws.start(52999);
  const port = ws.listeningPort!;

  await new Promise<void>((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => {
      s.write("GET http://[::1 HTTP/1.1\r\nHost: 127.0.0.1:52999\r\nConnection: close\r\n\r\n");
    });
    let data = "";
    s.on("data", (c: Buffer) => { data += c.toString("latin1"); });
    s.on("close", () => { console.log("malformed-target response:", JSON.stringify(data.slice(0, 200))); resolve(); });
    s.on("error", () => resolve());
    setTimeout(() => resolve(), 2000);
  });

  await new Promise((r) => setTimeout(r, 500));
  console.log("rejections:", JSON.stringify(rejections));
  const alive = await new Promise<string>((resolve) => {
    const s2 = net.connect(port, "127.0.0.1", () => s2.write("GET /health HTTP/1.1\r\nHost: 127.0.0.1:52999\r\nConnection: close\r\n\r\n"));
    let d = "";
    s2.on("data", (c: Buffer) => { d += c.toString("latin1"); });
    s2.on("close", () => resolve(d.split("\r\n")[0]));
    s2.on("error", (e: Error) => resolve("ERR " + e.message));
    setTimeout(() => resolve("TIMEOUT"), 2000);
  });
  console.log("alive-after:", alive);
  await ws.stop();
  process.exit(0);
}

void main();
