import type { WsContext } from "../types/runtime.js";

export type LoosenContextFns<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => unknown ? (...args: unknown[]) => any : T[K];
};

export type RepoFns = Record<string, (...args: unknown[]) => any>;

export type LooseWsContext = LoosenContextFns<WsContext>;
