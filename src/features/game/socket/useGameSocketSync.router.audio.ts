import { preloadAudio, ttsUrl } from "../../../hooks/game/usePreload.ts";
import { isLobbySettingsUpdatedMessage } from "../../../../shared/types/lobby.ts";
import {
  isAiHostSayMessage,
  isPreloadFinalJeopardyAssetMessage,
  isTtsReadyMessage,
} from "./useGameSocketSync.guards.ts";
import type { GameSocketRouterDeps, SocketMessage } from "./useGameSocketSync.router.shared.ts";

export function routeAudioMessage(message: SocketMessage, d: GameSocketRouterDeps): boolean {
  if (isAiHostSayMessage(message)) {
    const m = message;

    const assetId = typeof m.assetId === "string" ? m.assetId.trim() : "";
    if (assetId) {
      const offsetMs = (() => {
        if (typeof m.elapsedMs === "number" && Number.isFinite(m.elapsedMs)) {
          return Math.max(0, Math.round(m.elapsedMs));
        }
        if (typeof m.startedAtMs === "number" && Number.isFinite(m.startedAtMs)) {
          return Math.max(0, Math.round(d.nowMs() - m.startedAtMs));
        }
        return 0;
      })();
      const durationMs =
        typeof m.durationMs === "number" && Number.isFinite(m.durationMs)
          ? Math.max(0, m.durationMs)
          : null;

      if (durationMs != null && offsetMs >= durationMs + 250) return true;

      d.aiHostSeqRef.current += 1;
      d.setAiHostAsset(
        d.makeAiHostAssetPayload({
          seq: d.aiHostSeqRef.current,
          assetId,
          startedAtMs: m.startedAtMs,
          offsetMs,
        }),
      );
      return true;
    }

    const text = String(m.text || "").trim();
    if (!text) return true;

    d.aiHostSeqRef.current += 1;
    d.setAiHostText(`${d.aiHostSeqRef.current}::${text}`);
    return true;
  }

  if (isTtsReadyMessage(message)) {
    d.setTtsReady({ requestId: message.requestId, assetId: message.assetId, url: message.url });
    return true;
  }

  if (message.type === "tts-error") {
    console.error(message);
    return true;
  }

  if (isPreloadFinalJeopardyAssetMessage(message)) {
    void preloadAudio(ttsUrl(message.assetId));
    return true;
  }

  if (isLobbySettingsUpdatedMessage(message)) {
    d.setNarrationEnabled(Boolean(message.lobbySettings?.narrationEnabled));
    return true;
  }

  return false;
}
