import type { WsHandler } from "./types.js";
import { answerHandlers } from "./game/answerHandlers.js";
import { buzzHandlers } from "./game/buzzHandlers.js";
import { clueHandlers } from "./game/clueHandlers.js";
import { dailyDoubleHandlers } from "./game/dailyDoubleHandlers.js";
import { sessionHandlers } from "./game/sessionHandlers.js";
import { miscHandlers } from "./game/miscHandlers.js";

export const gameHandlers: Record<string, WsHandler> = {
  ...buzzHandlers,
  ...clueHandlers,
  ...answerHandlers,
  ...dailyDoubleHandlers,
  ...sessionHandlers,
  ...miscHandlers,
};
