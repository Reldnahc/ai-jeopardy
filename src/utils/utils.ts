function safeJsonParse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const e = (payload as Record<string, unknown>).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

export function getApiBase() {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  }
  return "";
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const payload = safeJsonParse(text);

  if (!res.ok) {
    const fallback = text?.trim() || `HTTP ${res.status}`;
    throw new Error(getErrorMessage(payload, fallback));
  }

  // If the server returns empty body on 204 etc
  if (payload === null) {
    return null as unknown as T;
  }

  return payload as T;
}
