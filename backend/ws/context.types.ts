import type { WsContext } from "../types/runtime.js";
import type { startGameTimer, clearGameTimer } from "../game/timer.js";
import type {
  validateImportedBoardData,
  parseBoardJson,
  normalizeCategories11,
} from "../validation/boardImport.js";
import type { requireHost, isHostSocket } from "../auth/hostGuard.js";
import type { createTrace } from "../services/trace.js";
import type { createBoardData, judgeClueAnswerFast, judgeImage } from "../services/aiService.js";
import type {
  checkAllDrawingsSubmitted,
  checkAllWagersSubmitted,
  submitDrawing,
  submitWager,
  submitWagerDrawing,
} from "../game/finalJeopardy/finalJeopardy.js";
import type { checkBoardTransition, isBoardFullyCleared } from "../game/stageTransition.js";
import type { getCOTD } from "../state/cotdStore.js";
import type { collectImageAssetIdsFromBoard } from "../services/imageAssetService.js";
import type { transcribeAnswerAudio } from "../services/stt/sttService.js";
import type {
  applyNewGameState,
  broadcastPreloadBatch,
  clearGenerationProgress,
  ensureHostOrFail,
  ensureLobbySettings,
  getBoardDataOrFail,
  getGameOrFail,
  initPreloadState,
  normalizeRole,
  resetGenerationProgressAndNotify,
  resolveModelOrFail,
  resolveVisualPolicy,
  safeAbortGeneration,
  setupPreloadHandshake,
} from "./handlers/lobby/createGame/index.js";
import type { clearAnswerWindow, startAnswerWindow } from "../game/answerWindow.js";
import type {
  autoResolveAfterJudgement,
  cancelAutoUnlock,
  doUnlockBuzzerAuthoritative,
  findCategoryForClue,
  parseClueValue,
} from "../game/gameLogic.js";
import type {
  aiHostSayAsset,
  aiHostSayByKey,
  aiHostVoiceSequence,
  ensureAiHostTtsBank,
  ensureAiHostValueTts,
  ensureFinalJeopardyAnswer,
  ensureFinalJeopardyWager,
} from "../game/host.js";
import type { verifyJwt } from "../auth/jwt.js";
import type { getBearerToken, playerStableId, verifyAccessToken } from "../services/userService.js";
import type { ensureTtsAsset } from "../services/tts/ensureTtsAsset.js";
import type {
  makeLimiter,
  plannedVisualSlots,
  populateCategoryVisuals,
} from "../services/ai/visuals.js";
import type { parseDailyDoubleWager } from "../services/ai/judge/wagerParse.js";
import type {
  computeDailyDoubleMaxWager,
  startDdWagerCapture,
  repromptDdWager,
  clearDdWagerTimer,
  finalizeDailyDoubleWagerAndStartClue,
} from "../game/dailyDouble/dailyDouble.js";
import type { numberToWords } from "../services/numberToWords.js";
import type { ensureBoardNarrationTtsForBoardData } from "../services/ai/board/boardTts.js";

export type Trace = {
  mark: (name: string, data?: Record<string, unknown>) => void;
  end?: (data?: Record<string, unknown>) => void;
};

export type AsyncLimiter = <T>(fn: () => Promise<T>) => Promise<T>;

export type EnsureTtsAssetParams = {
  text: string;
  textType: "text";
  voiceId: string;
  engine: string;
  outputFormat: string;
  provider: string;
};

export type AiHostTtsBank = {
  slotAssets?: Record<string, string[]>;
  nameAssetsByPlayer?: Record<string, string>;
  categoryAssetsByCategory?: Record<string, string>;
  valueAssetsByValue?: Record<string, string>;
  finalJeopardyAnswersByPlayer?: Record<string, string>;
  finalJeopardyWagersByPlayer?: Record<string, string>;
  allAssetIds?: string[];
};

export type Player = {
  username?: string | null;
  displayname?: string | null;
};

export type Category =
  | string
  | {
      name?: string | null;
      category?: string | null;
    };

type ActiveBoard = string;
type BoardDataLike = {
  firstBoard?: { categories?: Array<{ values?: Array<{ value?: unknown }> }> };
  secondBoard?: { categories?: Array<{ values?: Array<{ value?: unknown }> }> };
};

export type Game = {
  lobbySettings?: { narrationEnabled?: boolean | null } | null;
  players?: Player[] | null;
  categories?: Category[] | null;
  boardData?: BoardDataLike;
  aiHostTts?: AiHostTtsBank | null;
  aiHostPlayback?: {
    assetId: string;
    startedAtMs: number;
    durationMs?: number | null;
    endsAtMs?: number | null;
    clearTimer?: ReturnType<typeof setTimeout> | null;
  } | null;
  activeBoard?: ActiveBoard;
  ttsProvider?: string | null;
};

type ProfileRepo = Record<string, (...args: unknown[]) => Promise<unknown>> & {
  getRoleById: (id: string) => Promise<string | null>;
  getPublicProfileByUsername: (username: string) => Promise<{
    displayname?: string | null;
    color?: string | null;
    text_color?: string | null;
  } | null>;
  getIdByUsername: (username: string) => Promise<string | null>;
  addMoneyWon: (id: string, amount: number) => Promise<unknown>;
};

type BoardsRepo = Record<string, (...args: unknown[]) => Promise<unknown>> & {
  insertBoard: (ownerId: string, board: unknown) => Promise<unknown>;
};

type ImagesRepo = Record<string, (...args: unknown[]) => Promise<unknown>> & {
  getIdBySha256: (sha256: string) => Promise<string | null>;
  upsertImageAsset: (
    sha256: string,
    bytes: Buffer,
    size: number,
    width: number | null,
    height: number | null,
    sourceUrl: string | null,
    license: string | null,
    attribution: string | null,
  ) => Promise<string | null>;
};

type CtxRepos = Omit<WsContext["repos"], "profiles" | "boards" | "images" | "tts"> & {
  profiles: ProfileRepo;
  boards: BoardsRepo;
  images?: ImagesRepo;
  tts: Record<string, (...args: unknown[]) => Promise<unknown>> & {
    getIdBySha256Provider: (sha256: string, provider: string) => Promise<string | null>;
    upsertTtsAsset: (
      sha256: string,
      provider: string,
      audio: Buffer,
      bytes: number,
      text: string,
      textType: string,
      voiceId: string,
      engine: string,
      languageCode: string | null,
      contentType?: string,
    ) => Promise<string | null>;
  };
};

export type Ctx = Omit<
  WsContext,
  | "repos"
  | "startGameTimer"
  | "clearGameTimer"
  | "validateImportedBoardData"
  | "parseBoardJson"
  | "normalizeCategories11"
  | "requireHost"
  | "isHostSocket"
  | "startAnswerWindow"
  | "clearAnswerWindow"
  | "transcribeAnswerAudio"
  | "judgeClueAnswerFast"
  | "judgeImage"
  | "findCategoryForClue"
  | "getGameOrFail"
  | "ensureHostOrFail"
  | "ensureLobbySettings"
  | "normalizeRole"
  | "resolveModelOrFail"
  | "resolveVisualPolicy"
  | "resetGenerationProgressAndNotify"
  | "clearGenerationProgress"
  | "safeAbortGeneration"
  | "applyNewGameState"
  | "getBoardDataOrFail"
  | "ensureTtsAsset"
  | "ensureBoardNarrationTtsForBoardData"
  | "createTrace"
  | "createBoardData"
  | "submitWager"
  | "submitDrawing"
  | "submitWagerDrawing"
  | "checkAllWagersSubmitted"
  | "checkAllDrawingsSubmitted"
  | "isBoardFullyCleared"
  | "getCOTD"
  | "collectImageAssetIdsFromBoard"
  | "cancelAutoUnlock"
  | "doUnlockBuzzerAuthoritative"
  | "ensureAiHostTtsBank"
  | "ensureAiHostValueTts"
  | "playerStableId"
  | "getBearerToken"
  | "verifyAccessToken"
  | "aiHostVoiceSequence"
  | "aiHostSayByKey"
  | "aiHostSayAsset"
  | "verifyJwt"
  | "setupPreloadHandshake"
  | "initPreloadState"
  | "broadcastPreloadBatch"
  | "checkBoardTransition"
  | "parseClueValue"
  | "autoResolveAfterJudgement"
  | "plannedVisualSlots"
  | "makeLimiter"
  | "populateCategoryVisuals"
  | "parseDailyDoubleWager"
  | "computeDailyDoubleMaxWager"
  | "startDdWagerCapture"
  | "repromptDdWager"
  | "clearDdWagerTimer"
  | "finalizeDailyDoubleWagerAndStartClue"
  | "numberToWords"
  | "getTtsDurationMs"
  | "getClueKey"
  | "normalizeName"
  | "fireAndForget"
  | "ensureFinalJeopardyAnswer"
  | "ensureFinalJeopardyWager"
> & {
  repos: CtxRepos;
  startGameTimer: typeof startGameTimer;
  clearGameTimer: typeof clearGameTimer;
  validateImportedBoardData: typeof validateImportedBoardData;
  parseBoardJson: typeof parseBoardJson;
  normalizeCategories11: typeof normalizeCategories11;
  requireHost: typeof requireHost;
  isHostSocket: typeof isHostSocket;
  startAnswerWindow: typeof startAnswerWindow;
  clearAnswerWindow: typeof clearAnswerWindow;
  transcribeAnswerAudio: typeof transcribeAnswerAudio;
  judgeClueAnswerFast: typeof judgeClueAnswerFast;
  judgeImage: typeof judgeImage;
  findCategoryForClue: typeof findCategoryForClue;
  getGameOrFail: typeof getGameOrFail;
  ensureHostOrFail: typeof ensureHostOrFail;
  ensureLobbySettings: typeof ensureLobbySettings;
  normalizeRole: typeof normalizeRole;
  resolveModelOrFail: typeof resolveModelOrFail;
  resolveVisualPolicy: typeof resolveVisualPolicy;
  resetGenerationProgressAndNotify: typeof resetGenerationProgressAndNotify;
  clearGenerationProgress: typeof clearGenerationProgress;
  safeAbortGeneration: typeof safeAbortGeneration;
  applyNewGameState: typeof applyNewGameState;
  getBoardDataOrFail: typeof getBoardDataOrFail;
  ensureTtsAsset: typeof ensureTtsAsset;
  ensureBoardNarrationTtsForBoardData: typeof ensureBoardNarrationTtsForBoardData;
  createTrace: typeof createTrace;
  createBoardData: typeof createBoardData;
  submitWager: typeof submitWager;
  submitDrawing: typeof submitDrawing;
  submitWagerDrawing: typeof submitWagerDrawing;
  checkAllWagersSubmitted: typeof checkAllWagersSubmitted;
  checkAllDrawingsSubmitted: typeof checkAllDrawingsSubmitted;
  isBoardFullyCleared: typeof isBoardFullyCleared;
  getCOTD: typeof getCOTD;
  collectImageAssetIdsFromBoard: typeof collectImageAssetIdsFromBoard;
  cancelAutoUnlock: typeof cancelAutoUnlock;
  doUnlockBuzzerAuthoritative: typeof doUnlockBuzzerAuthoritative;
  ensureAiHostTtsBank: typeof ensureAiHostTtsBank;
  ensureAiHostValueTts: typeof ensureAiHostValueTts;
  playerStableId: typeof playerStableId;
  getBearerToken: typeof getBearerToken;
  verifyAccessToken: typeof verifyAccessToken;
  aiHostVoiceSequence: typeof aiHostVoiceSequence;
  aiHostSayByKey: typeof aiHostSayByKey;
  aiHostSayAsset: typeof aiHostSayAsset;
  verifyJwt: typeof verifyJwt;
  setupPreloadHandshake: typeof setupPreloadHandshake;
  initPreloadState: typeof initPreloadState;
  broadcastPreloadBatch: typeof broadcastPreloadBatch;
  checkBoardTransition: typeof checkBoardTransition;
  parseClueValue: typeof parseClueValue;
  autoResolveAfterJudgement: typeof autoResolveAfterJudgement;
  plannedVisualSlots: typeof plannedVisualSlots;
  makeLimiter: typeof makeLimiter;
  populateCategoryVisuals: typeof populateCategoryVisuals;
  parseDailyDoubleWager: typeof parseDailyDoubleWager;
  computeDailyDoubleMaxWager: typeof computeDailyDoubleMaxWager;
  startDdWagerCapture: typeof startDdWagerCapture;
  repromptDdWager: typeof repromptDdWager;
  clearDdWagerTimer: typeof clearDdWagerTimer;
  finalizeDailyDoubleWagerAndStartClue: typeof finalizeDailyDoubleWagerAndStartClue;
  numberToWords: typeof numberToWords;
  getTtsDurationMs: (assetId: string) => Promise<number>;
  getClueKey: (
    game: { activeBoard?: string | null },
    clue: { value?: unknown; question?: string | null },
  ) => string;
  normalizeName: (name: unknown) => string;
  fireAndForget: (p: PromiseLike<unknown>, label: string) => void;
  ensureFinalJeopardyAnswer: typeof ensureFinalJeopardyAnswer;
  ensureFinalJeopardyWager: typeof ensureFinalJeopardyWager;
};

export type SayResult = { assetId: string; ms: number };

export type VoiceStep = {
  slot?: string;
  assetId?: string;
  pad?: number;
  after?: () => void | Promise<void>;
};
