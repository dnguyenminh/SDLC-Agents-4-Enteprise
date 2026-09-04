// KSA-286: Router helpers — shared response utilities

export function apiSuccess<T>(data: T) {
  return { success: true, data, meta: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString() } };
}

export function apiError(code: string, message: string, status: number = 400) {
  return { status, body: { success: false, error: { code, message }, meta: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString() } } };
}

export function parsePagination(query: any): { page: number; size: number } {
  const page = Math.max(1, parseInt(query.page) || 1);
  const size = Math.min(100, Math.max(1, parseInt(query.size || query.limit) || 20));
  return { page, size };
}