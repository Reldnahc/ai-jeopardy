import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import LobbySidebar from "../features/lobby/components/LobbySidebar.tsx";
import LoadingScreen from "../components/common/LoadingScreen.tsx";
import PageCardContainer from "../components/common/PageCardContainer.tsx";
import HostControls from "../features/lobby/components/HostControls.tsx";
import CategoryBoard, { LobbyBoardType } from "../features/lobby/components/CategoryBoard.tsx";
import CategorySettings from "../features/lobby/components/CategorySettings.tsx";
import { useProfile } from "../contexts/ProfileContext.tsx";
import { useAlert } from "../contexts/AlertContext.tsx";
import { motion } from "framer-motion";
import { useLobbySocketSync } from "../features/lobby/socket/useLobbySocketSync";
import { usePlayerIdentity } from "../hooks/usePlayerIdentity.ts";
import { useLobbyPreloadAck } from "../hooks/lobby/useLobbyPreloadAck.ts";
import { useLobbyBoardJson } from "../hooks/lobby/useLobbyBoardJson.ts";
import { useLobbySessionAndNavigation } from "../hooks/lobby/useLobbySessionAndNavigation.ts";
import { useLobbyCreateGame } from "../hooks/lobby/useLobbyCreateGame.tsx";

const Lobby: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const [copySuccess, setCopySuccess] = useState(false);
  const [boardJsonError, setBoardJsonError] = useState<string | null>(null);

  const { sendJson } = useWebSocket();
  const { profile, fetchPublicProfiles } = useProfile();
  const { showAlert } = useAlert();

  const { playerKey, username, displayname } = usePlayerIdentity({
    gameId,
  });

  const {
    isSocketReady,
    isLoading,
    loadingMessage,
    loadingProgress,
    setManualLoading,
    allowLeave,
    players,
    host,
    isHostServer,
    categories,
    lockedCategories,
    onPromoteHost,
    onToggleLock,
    onChangeCategory,
    lobbySettings,
    updateLobbySettings,
    categoryPoolState,
    lobbyInvalid,
    preloadAssetIds,
    isPreloadingImages,
    preloadTtsAssetIds,
    isPreloadingAudio,
    preloadFinalToken,
  } = useLobbySocketSync({
    gameId,
    playerKey,
    username,
    displayname,
    showAlert,
  });

  const isHost = isHostServer;

  useEffect(() => {
    const set = new Set<string>();

    const h = String(host ?? "")
      .trim()
      .toLowerCase();
    if (h) set.add(h);

    for (const p of players ?? []) {
      const u = String((p as { username?: unknown })?.username ?? "")
        .trim()
        .toLowerCase();
      if (u) set.add(u);
    }

    const usernames = Array.from(set);
    if (usernames.length === 0) return;

    // fire and forget; context will only fetch missing ones
    void fetchPublicProfiles(usernames).catch(() => {});
  }, [players, host, fetchPublicProfiles]);

  useLobbySessionAndNavigation({
    lobbyInvalid,
    allowLeave,
    isSocketReady,
    gameId,
    username,
    displayname,
    isHost,
    host,
    playerKey,
  });

  const { boardJson, usingImportedBoard, tryValidateBoardJson } = useLobbyBoardJson(lobbySettings);

  useLobbyPreloadAck({
    sendJson,
    gameId,
    username,
    playerKey,
    preloadFinalToken,
    preloadAssetIds,
    isPreloadingImages,
    preloadTtsAssetIds,
    isPreloadingAudio,
  });

  const handleRandomizeCategory = (boardType: LobbyBoardType, index: number) => {
    if (!isSocketReady) return;
    if (!gameId) return;

    sendJson({
      type: "randomize-category",
      gameId,
      boardType,
      index,
    });
  };

  const handleCreateGame = useLobbyCreateGame({
    profile,
    showAlert,
    boardJson,
    tryValidateBoardJson,
    usingImportedBoard,
    setBoardJsonError,
    categories,
    setManualLoading,
    isSocketReady,
    gameId,
    sendJson,
  });

  const handleToggleCategoryRefreshLock = (nextLocked: boolean) => {
    updateLobbySettings({ categoryRefreshLocked: nextLocked });
  };

  const handleRefreshCategoryPool = () => {
    if (!gameId) return;
    sendJson({
      type: "refresh-category-pool",
      gameId,
      username,
      playerKey,
    });
  };

  const handleUpdateCategoryPrompt = (prompt: string) => {
    if (!gameId) return;
    sendJson({
      type: "update-category-prompt",
      gameId,
      prompt,
    });
  };

  return isLoading ? (
    <LoadingScreen message={loadingMessage} progress={loadingProgress ?? 0} />
  ) : (
    <div className="min-h-[calc(100vh-5.5rem)] p-6">
      <PageCardContainer className="mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)]">
          {/* Sidebar Column */}
          <div className="border-r border-gray-200 bg-gray-50 p-6">
            <LobbySidebar
              gameId={gameId}
              host={host}
              players={players}
              copySuccess={copySuccess}
              setCopySuccess={setCopySuccess}
              isHost={isHost}
              onPromoteHost={onPromoteHost}
            />
          </div>

          {/* Main Content Column */}
          <div className="p-8">
            {/* Category Boards */}
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ">
                <div className="min-w-0">
                  <CategoryBoard
                    title="Jeopardy!"
                    categories={categories.firstBoard}
                    isHost={isHost}
                    lockedCategories={lockedCategories.firstBoard}
                    boardType="firstBoard"
                    onChangeCategory={onChangeCategory}
                    onRandomizeCategory={handleRandomizeCategory}
                    onToggleLock={onToggleLock}
                  />
                </div>
                <div className="min-w-0">
                  <CategoryBoard
                    title="Double Jeopardy!"
                    categories={categories.secondBoard}
                    isHost={isHost}
                    lockedCategories={lockedCategories.secondBoard}
                    boardType="secondBoard"
                    onChangeCategory={onChangeCategory}
                    onRandomizeCategory={handleRandomizeCategory}
                    onToggleLock={onToggleLock}
                  />
                </div>
              </div>

              <CategoryBoard
                title="Final Jeopardy!"
                categories={categories.finalJeopardy}
                isHost={isHost}
                lockedCategories={lockedCategories.finalJeopardy}
                boardType="finalJeopardy"
                onChangeCategory={onChangeCategory}
                onRandomizeCategory={handleRandomizeCategory}
                onToggleLock={onToggleLock}
              />
            </div>

            {/* Category Settings */}
            <CategorySettings
              isHost={isHost}
              lobbySettings={lobbySettings}
              categoryPoolState={categoryPoolState}
              onToggleLock={handleToggleCategoryRefreshLock}
              onRefreshPool={handleRefreshCategoryPool}
              onUpdatePrompt={handleUpdateCategoryPrompt}
            />

            {/* Host Controls */}
            {isHost && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
                <HostControls
                  onCreateGame={handleCreateGame}
                  isSoloLobby={players.length <= 1}
                  boardJsonError={boardJsonError}
                  setBoardJsonError={setBoardJsonError}
                  tryValidateBoardJson={tryValidateBoardJson}
                  lobbySettings={lobbySettings}
                  updateLobbySettings={updateLobbySettings}
                />
              </motion.div>
            )}
          </div>
        </div>
      </PageCardContainer>
    </div>
  );
};

export default Lobby;

