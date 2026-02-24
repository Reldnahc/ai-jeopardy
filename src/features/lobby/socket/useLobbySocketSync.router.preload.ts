import type { LobbySocketMessage, LobbySocketRouterDeps } from "./useLobbySocketSync.router.shared.ts";

export function routeLobbyPreloadMessage(
  message: LobbySocketMessage,
  d: LobbySocketRouterDeps,
): boolean {
  if (message.type === "generation-progress") {
    const m = message as { progress?: unknown };
    const p = typeof m.progress === "number" ? m.progress : 0;
    d.setLoadingProgress(Math.max(0, Math.min(1, p)));
    return true;
  }

  if (message.type === "trigger-loading") {
    d.setIsLoading(true);
    d.setLoadingMessage("Generating your questions...");
    d.setLoadingProgress(0);
    return true;
  }

  if (message.type === "create-board-failed") {
    d.setIsLoading(false);
    d.setIsPreloadingImages(false);
    d.setPreloadAssetIds(null);

    const m = message as { message?: string };
    const alertContent = m.message ?? "Unknown error.";
    void d.showAlert("Game Start Failed", alertContent, [
      {
        label: "Okay",
        actionValue: "okay",
        styleClass: "bg-green-500 text-white hover:bg-green-600",
      },
    ]);
    return true;
  }

  if (message.type === "start-game") {
    d.setIsPreloadingImages(false);
    d.setPreloadAssetIds(null);
    d.setIsLoading(false);
    d.setAllowLeave(true);
    return true;
  }

  if (message.type === "preload-images") {
    const m = message as {
      assetIds?: string[];
      ttsAssetIds?: string[];
      token?: number;
      final?: boolean;
    };

    const tok = Number(m.token);
    if (Number.isFinite(tok)) d.setPreloadToken(tok);
    if (m.final && Number.isFinite(tok)) d.setPreloadFinalToken(tok);

    const nextImages = Array.isArray(m.assetIds) ? m.assetIds.filter(Boolean) : [];
    const nextTts = Array.isArray(m.ttsAssetIds) ? m.ttsAssetIds.filter(Boolean) : [];

    d.setAllowLeave(false);

    d.setPreloadAssetIds((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];
      return Array.from(new Set([...prevArr, ...nextImages]));
    });
    d.setIsPreloadingImages(true);

    d.setPreloadTtsAssetIds((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];
      return Array.from(new Set([...prevArr, ...nextTts]));
    });
    d.setIsPreloadingAudio(true);
    return true;
  }

  if (message.type === "preload-start") {
    const m = message as { token?: number };
    const tok = Number(m.token);
    d.setPreloadToken(Number.isFinite(tok) ? tok : 0);
    d.setPreloadFinalToken(null);
    d.setPreloadAssetIds(null);
    d.setPreloadTtsAssetIds(null);
    d.setIsPreloadingImages(false);
    d.setIsPreloadingAudio(false);
    return true;
  }

  return false;
}
