type TraceMeta = {
  requestId?: string;
  [key: string]: unknown;
};

type TraceMark = {
  name: string;
  t: number;
  dt: number;
  [key: string]: unknown;
};

export function createTrace(label: string, meta: TraceMeta = {}) {
  const start = Date.now();
  const marks: TraceMark[] = [];
  const id =
    meta.requestId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function mark(name: string, extra: Record<string, unknown> = {}) {
    const t = Date.now();
    marks.push({ name, t, dt: t - start, ...extra });
    console.log(`[TRACE ${id}] ${label} +${t - start}ms :: ${name}`, extra);
  }

  function end(extra: Record<string, unknown> = {}) {
    const total = Date.now() - start;
    console.log(`[TRACE ${id}] ${label} DONE +${total}ms`, { ...meta, ...extra });
    if (marks.length) console.table(marks.map((m: { dt: number; name: string }) => ({ dt: m.dt, name: m.name })));
    return { id, total, marks };
  }

  return { id, mark, end };
}
