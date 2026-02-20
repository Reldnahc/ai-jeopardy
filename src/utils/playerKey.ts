const KEY = "ai-jeopardy-playerKey";

export function getOrCreatePlayerKey(): string {
  const existing = localStorage.getItem(KEY);
  if (existing && existing.trim()) return existing;

  const created = crypto.randomUUID();
  localStorage.setItem(KEY, created);
  return created;
}

export function getPlayerKey(): string | null {
  const v = localStorage.getItem(KEY);
  return v && v.trim() ? v : null;
}
