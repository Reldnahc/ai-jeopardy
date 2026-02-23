import type { SocketState } from "../../types/runtime.js";
import type { Ctx } from "../context.types.js";

export type WsHandlerArgs<TData extends Record<string, unknown> = Record<string, unknown>> = {
  ws: SocketState;
  data: TData;
  ctx: Ctx;
};

export type WsHandler<TData extends Record<string, unknown> = Record<string, unknown>> = (
  args: WsHandlerArgs<TData>,
) => Promise<unknown> | unknown;
