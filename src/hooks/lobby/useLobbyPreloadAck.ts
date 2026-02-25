import { useEffect, useRef, useState } from "react";
import { usePreloadAudioAssetIds, usePreloadImageAssetIds } from "../game/usePreload.ts";

type Params = {
  sendJson: (payload: Record<string, unknown>) => void;
  gameId?: string;
  username?: string | null;
  playerKey?: string | null;
  preloadFinalToken?: string | number | null;
  preloadAssetIds?: string[] | null;
  isPreloadingImages?: boolean;
  preloadTtsAssetIds?: string[] | null;
  isPreloadingAudio?: boolean;
};

export function useLobbyPreloadAck({
  sendJson,
  gameId,
  username,
  playerKey,
  preloadFinalToken,
  preloadAssetIds,
  isPreloadingImages,
  preloadTtsAssetIds,
  isPreloadingAudio,
}: Params) {
  const preloadAckSentRef = useRef(false);

  const [imagesDone, setImagesDone] = useState(false);
  const [audioDone, setAudioDone] = useState(false);

  const canAck = preloadFinalToken != null;

  useEffect(() => {
    if (preloadAckSentRef.current) return;
    if (!canAck) return;

    const imagesOk = !isPreloadingImages || !preloadAssetIds?.length || imagesDone;
    const audioOk = !isPreloadingAudio || !preloadTtsAssetIds?.length || audioDone;

    if (!imagesOk || !audioOk) return;

    preloadAckSentRef.current = true;

    sendJson({
      type: "preload-done",
      gameId,
      username,
      playerKey,
      token: preloadFinalToken, // IMPORTANT: send token
    });
  }, [
    canAck,
    preloadFinalToken,
    isPreloadingImages,
    isPreloadingAudio,
    preloadAssetIds,
    preloadTtsAssetIds,
    imagesDone,
    audioDone,
    sendJson,
    gameId,
    username,
    playerKey,
  ]);

  useEffect(() => {
    setImagesDone(false);
  }, [preloadAssetIds]);

  useEffect(() => {
    setAudioDone(false);
  }, [preloadTtsAssetIds]);

  usePreloadImageAssetIds(preloadAssetIds, isPreloadingImages, () => {
    setImagesDone(true);
  });

  usePreloadAudioAssetIds(preloadTtsAssetIds, isPreloadingAudio, () => {
    setAudioDone(true);
  });
}
