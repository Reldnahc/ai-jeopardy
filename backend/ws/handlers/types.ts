import type { SocketState } from "../../types/runtime.js";
import type { Ctx } from "../context.types.js";

export type WsHandlerArgs<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TCtx = Ctx,
> = {
  ws: SocketState;
  data: TData;
  ctx: TCtx;
};

export type WsHandler<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TCtx = Ctx,
> = (
  args: WsHandlerArgs<TData, TCtx>,
) => Promise<unknown> | unknown;
