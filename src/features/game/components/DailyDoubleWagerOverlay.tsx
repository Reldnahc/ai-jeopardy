import { useWebSocket } from "../../../contexts/WebSocketContext.tsx";
import Timer from "./Timer.tsx";
import {
  DailyDoubleShowModalMsg,
  DailyDoubleWagerCaptureStartMsg,
} from "../socket/useGameSocketSync.ts";
import { blobToBase64, useVadAudioCapture } from "./useVadAudioCapture.ts";

type Props = {
  gameId: string;
  myUsername: string | null;
  ddWagerCapture: DailyDoubleWagerCaptureStartMsg | null;
  showDdModal: DailyDoubleShowModalMsg | null;
  ddWagerError: string | null;
  timerEndTime: number | null;
  timerDuration: number;
};

export default function DailyDoubleWagerOverlay({
  gameId,
  myUsername,
  ddWagerCapture,
  ddWagerError,
  timerEndTime,
  timerDuration,
  showDdModal,
}: Props) {
  const { sendJson } = useWebSocket();

  const isDdWagerPlayer = !!myUsername && ddWagerCapture?.username === myUsername;
  const ddWagerSessionId = ddWagerCapture?.ddWagerSessionId ?? null;

  const { isRecording } = useVadAudioCapture({
    enabled: isDdWagerPlayer,
    sessionId: ddWagerSessionId,
    durationMs: ddWagerCapture?.durationMs,
    onCaptureComplete: async ({ blob }) => {
      if (!ddWagerSessionId) return;

      const dataBase64 = await blobToBase64(blob);

      sendJson({
        type: "daily-double-wager-audio-blob",
        gameId,
        ddWagerSessionId,
        mimeType: blob.type,
        dataBase64,
      });
    },
    onError: (err) => {
      console.error("DD wager mic capture failed:", err);
    },
  });

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85">
      <div className="absolute left-8 top-0 ">
        <Timer endTime={timerEndTime} duration={timerDuration} />
      </div>

      <div className="w-[min(820px,94vw)] rounded-3xl bg-blue-950 p-12 text-white shadow-2xl">
        <div className="text-6xl font-extrabold text-yellow-400 font-swiss911 text-shadow-jeopardy tracking-wider">
          Daily Double!
        </div>

        <div className="mt-6 text-2xl">
          <span className="font-bold">{showDdModal?.displayname}</span> must wager (max{" "}
          <span className="font-bold">${showDdModal?.maxWager.toLocaleString()}</span>)
        </div>

        {isDdWagerPlayer && isRecording ? (
          <div className="mt-6 text-lg text-red-500 font-semibold">
            Recording your wager now! say a number (or true daily double).
          </div>
        ) : isDdWagerPlayer ? (
          <div className="mt-6 text-lg opacity-80">Waiting for host...</div>
        ) : (
          <div className="mt-6 text-lg opacity-80">Please wait...</div>
        )}

        {/* Reserve space for error (prevents layout jump) */}
        <div
          className={[
            "mt-6 text-lg font-medium transition-opacity",
            "min-h-[28px]", // ~ one line at text-lg
            ddWagerError ? "opacity-100 text-red-300" : "opacity-0",
          ].join(" ")}
          aria-live="polite"
        >
          {ddWagerError || "\u00A0"}
        </div>
      </div>
    </div>
  );
}
