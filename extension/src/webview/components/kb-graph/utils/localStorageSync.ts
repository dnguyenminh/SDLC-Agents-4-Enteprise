export interface WindowState {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
}

export function sanitizeWindowState(raw: any, bounds: { innerWidth: number; innerHeight: number }): WindowState {
  const def: WindowState = { x: 0, y: 0, w: 400, h: 300, maximized: false };
  if (typeof raw !== 'object' || raw === null) return def;
  return {
    x: Math.max(0, Math.min(Number(raw.x) || 0, bounds.innerWidth - 100)),
    y: Math.max(0, Math.min(Number(raw.y) || 0, bounds.innerHeight - 100)),
    w: Math.max(200, Math.min(Number(raw.w) || 400, bounds.innerWidth - 50)),
    h: Math.max(150, Math.min(Number(raw.h) || 300, bounds.innerHeight - 50)),
    maximized: !!raw.maximized
  };
}

export function loadFromLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or unavailable
    console.warn('[localStorage] Save failed');
  }
}
