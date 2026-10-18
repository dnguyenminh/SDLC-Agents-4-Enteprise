/**
 * Shared mock helpers for createChatCompletionsHandler tests.
 * The handler (src/anthropic/handlers.ts) takes a minimal
 * `{ body }` request and an express-style response object —
 * these helpers invoke it directly without a real HTTP server
 * (express is not a runtime dependency of the extension).
 */

import { createChatCompletionsHandler } from '../handlers';
import type { ConversationHistory } from '../../history/conversation';
import type { KiroQResponse, ContinuationRequest } from '../types';

export function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let jsonBody: any = null;
  let written = '';
  const res: any = {
    status(c: number) { statusCode = c; return res; },
    json(obj: any) { jsonBody = obj; return res; },
    setHeader(k: string, v: string) { headers[k] = v; },
    write(s: string) { written += s; },
    end() {},
    getStatus: () => statusCode,
    getJson: () => jsonBody,
    getHeaders: () => headers,
    getBody: () => written,
  };
  return res;
}

export function invokeHandler(
  history: ConversationHistory,
  mockForward: (req: ContinuationRequest) => Promise<KiroQResponse>,
  body: ContinuationRequest,
) {
  const handler = createChatCompletionsHandler(history, mockForward);
  const req: any = { body };
  const res = createMockRes();
  return handler(req, res).then(() => res);
}
