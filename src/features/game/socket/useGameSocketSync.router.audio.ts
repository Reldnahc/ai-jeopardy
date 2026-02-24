import { preloadAudio, ttsUrl } from "../../../hooks/game/usePreload.ts";
import type { GameSocketRouterDeps, SocketMessage } from "./useGameSocketSync.router.shared.ts";

export function routeAudioMessage(message: SocketMessage, d: GameSocketRouterDeps): boolean {
  if (message.type === "ai-host-say") {
    const m = message as {
      text?: string;
      assetId?: string;
      startedAtMs?: number;
      durationMs?: number;
      elapsedMs?: number;
    };

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

  if (message.type === "tts-ready") {
    const m = message as { requestId?: string; assetId: string; url: string };
    d.setTtsReady({ requestId: m.requestId, assetId: m.assetId, url: m.url });
    return true;
  }

  if (message.type === "tts-error") {
    console.error(message);
    return true;
  }

  if (message.type === "preload-final-jeopardy-asset") {
    const m = message as { assetId: string };
    void preloadAudio(ttsUrl(m.assetId));
    return true;
  }

  if (message.type === "lobby-settings-updated") {
    const m = message as { lobbySettings?: { narrationEnabled?: boolean } | null };
    d.setNarrationEnabled(Boolean(m.lobbySettings?.narrationEnabled));
    return true;
  }

  return false;
}
