import { isLobbyPlayerSummary } from "../../../../shared/types/lobby.ts";
import type { GameStateMessage, TtsReady } from "./useGameSocketSync.types.ts";
import type { SocketMessage } from "./useGameSocketSync.router.shared.ts";

type AiHostSayMessage = {
  type: "ai-host-say";
  text?: string;
  assetId?: string;
  startedAtMs?: number;
  durationMs?: number;
  elapsedMs?: number;
};

type TtsReadyMessage = TtsReady & { type: "tts-ready" };

type PreloadFinalJeopardyAssetMessage = {
  type: "preload-final-jeopardy-asset";
  assetId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isGameStateMessage(message: SocketMessage): message is GameStateMessage {
  return (
    message.type === "game-state" &&
    Array.isArray(message.players) &&
    message.players.every(isLobbyPlayerSummary) &&
    isString(message.host) &&
    isRecord(message.boardData)
  );
}

export function isAiHostSayMessage(message: SocketMessage): message is AiHostSayMessage {
  return (
    message.type === "ai-host-say" &&
    (message.text === undefined || isString(message.text)) &&
    (message.assetId === undefined || isString(message.assetId)) &&
    (message.startedAtMs === undefined || isFiniteNumber(message.startedAtMs)) &&
    (message.durationMs === undefined || isFiniteNumber(message.durationMs)) &&
    (message.elapsedMs === undefined || isFiniteNumber(message.elapsedMs))
  );
}

export function isTtsReadyMessage(message: SocketMessage): message is TtsReadyMessage {
  return (
    message.type === "tts-ready" &&
    isString(message.assetId) &&
    isString(message.url) &&
    (message.requestId === undefined || isString(message.requestId))
  );
}

export function isPreloadFinalJeopardyAssetMessage(
  message: SocketMessage,
): message is PreloadFinalJeopardyAssetMessage {
  return message.type === "preload-final-jeopardy-asset" && isString(message.assetId);
}
