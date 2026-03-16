import type { LobbySocketMessage, LobbySocketRouterDeps } from "./useLobbySocketSync.router.shared.ts";
import {
  isCreateBoardFailedMessage,
  isGenerationProgressMessage,
  isPreloadImagesMessage,
  isPreloadStartMessage,
} from "../../../../shared/types/lobby.ts";

export function routeLobbyPreloadMessage(
  message: LobbySocketMessage,
  d: LobbySocketRouterDeps,
): boolean {
  if (isGenerationProgressMessage(message)) {
    const m = message;
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

  if (isCreateBoardFailedMessage(message)) {
    d.setIsLoading(false);
    d.setIsPreloadingImages(false);
    d.setPreloadAssetIds(null);

    const alertContent = message.message ?? "Unknown error.";
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

  if (isPreloadImagesMessage(message)) {
    const m = message;

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

  if (isPreloadStartMessage(message)) {
    const tok = Number(message.token);
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
