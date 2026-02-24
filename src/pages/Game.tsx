import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import FinalScoreScreen from "../features/game/components/FinalScoreScreen.tsx";
import JeopardyBoard from "../features/game/components/JeopardyBoard.tsx";
import Sidebar from "../features/game/components/Sidebar.tsx";
import type {
  AnswerUiState,
  BuzzUiState,
  DailyDoubleUiState,
  FinalUiState,
  TimerUiState,
} from "../features/game/components/gameViewModels.ts";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import { useEarlyMicPermission } from "../hooks/earlyMicPermission.ts";
import { usePreload } from "../hooks/game/usePreload.ts";
import { useGameSession } from "../hooks/useGameSession.ts";
import { usePlayerIdentity } from "../hooks/usePlayerIdentity.ts";
import { useGameAudioPlayback } from "../features/game/page/useGameAudioPlayback.ts";
import { useGameCommands } from "../features/game/page/useGameCommands.ts";
import { useGameSessionSync } from "../features/game/page/useGameSessionSync.ts";
import { useGameSocketSync } from "../features/game/socket/useGameSocketSync.ts";

function norm(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, saveSession, clearSession } = useGameSession();
  const [lastQuestionValue, setLastQuestionValue] = useState<number>(100);

  const { username, displayname, playerKey } = usePlayerIdentity({
    gameId,
    locationState: location.state ?? null,
    allowProfileFallback: true,
  });

  const myUsername = norm(username);
  const myDisplayname = String(displayname ?? "").trim();

  const {
    isSocketReady,
    isHost,
    host,
    players,
    scores,
    boardData,
    activeBoard,
    selectedClue,
    clearedClues,
    buzzerLocked,
    buzzResult,
    buzzResultDisplay,
    buzzLockedOut,
    hasBuzzedCurrentClue,
    timerEndTime,
    timerDuration,
    isFinalJeopardy,
    allWagersSubmitted,
    wagers,
    finalWagers,
    finalWagerDrawings,
    drawings,
    isGameOver,
    markAllCluesComplete,
    narrationEnabled,
    answerCapture,
    answerError,
    phase,
    selectorKey,
    selectorName,
    aiHostAsset,
    boardSelectionLocked,
    selectedFinalist,
    ddWagerCapture,
    ddWagerError,
    showDdModal,
    showWager,
    finalists,
    answerProcessing,
  } = useGameSocketSync({ gameId, username: myUsername });

  const { sendJson, nowMs, nowFromPerfMs, perfNowMs, lastSyncAgeMs } = useWebSocket();

  const { audioVolume, setAudioVolume, micPermission, requestMicPermission, showAutoplayReminder } =
    useGameAudioPlayback({
      aiHostAsset,
      narrationEnabled,
      nowMs,
    });

  useGameSessionSync({
    gameId,
    isSocketReady,
    host,
    myUsername,
    myDisplayname,
    username,
    playerKey,
    isHost,
    session,
    saveSession,
    sendJson,
  });

  const isSelectorOnBoard = Boolean(
    phase === "board" && myUsername && selectorKey && norm(selectorKey) === myUsername,
  );
  const canSelectClue = Boolean(isSelectorOnBoard && !boardSelectionLocked);

  const { handleScoreUpdate, leaveGame, handleBuzz, onClueSelected } = useGameCommands({
    gameId,
    myUsername,
    sendJson,
    clearSession,
    navigate,
    isFinalJeopardy,
    allWagersSubmitted,
    wagers,
    canSelectClue,
    buzzResult,
    buzzLockedOut,
    perfNowMs,
    nowFromPerfMs,
    lastSyncAgeMs,
    setLastQuestionValue,
  });

  usePreload(boardData, Boolean(boardData));
  useEarlyMicPermission();

  const safeActiveBoard = activeBoard || "firstBoard";
  const safeCategories = boardData?.[safeActiveBoard]?.categories;

  const buzzUi: BuzzUiState = {
    buzzerLocked,
    buzzResult,
    buzzResultDisplay,
    buzzLockedOut,
    hasBuzzedCurrentClue,
  };
  const timerUi: TimerUiState = { timerEndTime, timerDuration };
  const answerUi: AnswerUiState = {
    answerCapture,
    answerError,
    answerProcessing,
    myUsername,
  };
  const finalUi: FinalUiState = {
    finalWagers,
    finalWagerDrawings,
    selectedFinalist,
    showWager,
    finalists,
  };
  const ddUi: DailyDoubleUiState = {
    ddWagerCapture,
    ddWagerError,
    showDdModal,
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden font-sans bg-gradient-to-b from-[#183a75] via-[#2a5fb3] to-[#1c4a96]">
      <Sidebar
        players={players}
        scores={scores}
        buzzResult={buzzResult}
        narrationEnabled={narrationEnabled}
        audioVolume={audioVolume}
        onChangeAudioVolume={setAudioVolume}
        lastQuestionValue={lastQuestionValue}
        activeBoard={safeActiveBoard}
        handleScoreUpdate={handleScoreUpdate}
        markAllCluesComplete={markAllCluesComplete}
        onLeaveGame={leaveGame}
        selectorName={selectorName}
        micPermission={micPermission}
        showAutoplayReminder={showAutoplayReminder}
        onRequestMicPermission={() => {
          void requestMicPermission();
        }}
        onToggleDailyDoubleSnipe={(enabled) => {
          sendJson({ type: "dd-snipe-next", gameId, enabled });
        }}
      />

      <div className="flex flex-1 justify-center items-center overflow-hidden p-0">
        {isGameOver ? (
          <FinalScoreScreen scores={scores} />
        ) : (
          <JeopardyBoard
            boardData={safeCategories || []}
            canSelectClue={canSelectClue}
            onClueSelected={onClueSelected}
            selectedClue={selectedClue || null}
            gameId={gameId || ""}
            clearedClues={clearedClues}
            players={players}
            scores={scores}
            currentPlayer={myUsername}
            allWagersSubmitted={allWagersSubmitted}
            isFinalJeopardy={isFinalJeopardy}
            drawings={drawings}
            handleBuzz={handleBuzz}
            buzzUi={buzzUi}
            timerUi={timerUi}
            answerUi={answerUi}
            finalUi={finalUi}
            ddUi={ddUi}
          />
        )}
      </div>
    </div>
  );
}
