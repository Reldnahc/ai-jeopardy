import { lobbyHandlers } from "./handlers/lobbyHandlers.js";
import { gameHandlers } from "./handlers/gameHandlers.js";
import { userHandlers } from "./handlers/userHandlers.js";

const HANDLERS = {
  ...userHandlers,
  ...lobbyHandlers,
  ...gameHandlers,
};

export const routeWsMessage = async (ws, raw, ctx) => {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString());
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
