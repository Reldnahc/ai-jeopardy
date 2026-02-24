import type { WsHandler } from "./types.js";
import { lobbyCategoryHandlers } from "./lobby/lobbyCategoryHandlers.js";
import { lobbyConfigHandlers } from "./lobby/lobbyConfigHandlers.js";
import { lobbyPlayerHandlers } from "./lobby/lobbyPlayerHandlers.js";
import { lobbyStartHandlers } from "./lobby/lobbyStartHandlers.js";

export const lobbyHandlers: Record<string, WsHandler> = {
  ...lobbyStartHandlers,
  ...lobbyPlayerHandlers,
  ...lobbyConfigHandlers,
  ...lobbyCategoryHandlers,
};
