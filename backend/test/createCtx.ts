import type { Ctx } from "../ws/context.types.js";

export function createCtx(base: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}): Ctx {
  return { ...base, ...overrides } as unknown as Ctx;
}

export function fireAndForget(promise: PromiseLike<unknown>) {
  void promise;
}
