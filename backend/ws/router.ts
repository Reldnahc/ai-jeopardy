import { lobbyHandlers } from "./handlers/lobbyHandlers.js";
import { gameHandlers } from "./handlers/gameHandlers.js";
import { userHandlers } from "./handlers/userHandlers.js";
import type { SocketState } from "../types/runtime.js";
import type { Ctx } from "./context.types.js";
import type { WsHandler } from "./handlers/types.js";

const HANDLERS: Record<string, WsHandler> = {
  ...userHandlers,
  ...lobbyHandlers,
  ...gameHandlers,
};

export const routeWsMessage = async (
  ws: SocketState,
  raw: Buffer | string,
  ctx: Ctx,
): Promise<boolean> => {
  let data: Record<string, unknown>;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString("utf8"));
  } catch {
    return false;
  }

  if (!data || typeof data !== "object") return false;

  const type = String(data.type || "");
  if (!type) return false;

  const handler = HANDLERS[type];
  if (!handler) return false;

  await handler({ ws, data, ctx });
  return true;
};
