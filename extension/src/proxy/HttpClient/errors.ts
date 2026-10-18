/**
 * HttpClient shared contracts — error type + tool result shape.
 */

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
}
