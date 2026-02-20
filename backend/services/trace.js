export function createTrace(label, meta = {}) {
  const start = Date.now();
  const marks = [];
  const id =
    meta.requestId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function mark(name, extra = {}) {
    const t = Date.now();
    marks.push({ name, t, dt: t - start, ...extra });
    console.log(`[TRACE ${id}] ${label} +${t - start}ms :: ${name}`, extra);
  }

  function end(extra = {}) {
    const total = Date.now() - start;
    console.log(`[TRACE ${id}] ${label} DONE +${total}ms`, { ...meta, ...extra });
    if (marks.length) console.table(marks.map((m) => ({ dt: m.dt, name: m.name })));
    return { id, total, marks };
  }

  return { id, mark, end };
}
