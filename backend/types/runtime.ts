import type WebSocket from "ws";
import type { Role } from "../../shared/roles.js";

export type JsonMap = Record<string, unknown>;
export type TimerKind = "buzz" | "answer" | "wager" | "final-wager" | "final-draw" | string;

export type PlayerState = {
  id?: string | null;
  username?: string | null;
  displayname?: string | null;
  name?: string | null;
  online?: boolean;
  playerKey?: string | null;
  [key: string]: unknown;
};

export type BoardClue = {
  value?: number | string | null;
  question?: string | null;
  answer?: string | null;
  category?: string | null;
  media?: unknown;
  [key: string]: unknown;
};

export type GameState = {
  host?: string | null;
  players?: PlayerState[];
  scores?: Record<string, number>;
  inLobby?: boolean;
  categories?: unknown[];
  lockedCategories?: {
    firstBoard?: boolean[];
    secondBoard?: boolean[];
    finalJeopardy?: boolean[];
  } | null;
  categoryPool?: string[] | null;
  categoryPoolGeneratedAtMs?: number | null;
  categoryPoolNextAllowedAtMs?: number | null;
  categoryPoolGenerating?: boolean;
  lobbySettings?: {
    timeToBuzz?: number;
    timeToAnswer?: number;
    selectedModel?: string;
    reasoningEffort?: string;
    visualMode?: string;
    narrationEnabled?: boolean;
    boardJson?: string;
    sttProviderName?: string;
    categoryRefreshLocked?: boolean;
    categoryPoolPrompt?: string;
    [key: string]: unknown;
  } | null;
  boardData?: {
    firstBoard?: { categories?: Array<{ category?: string; values?: BoardClue[] }> };
    secondBoard?: { categories?: Array<{ category?: string; values?: BoardClue[] }> };
    finalJeopardy?: { categories?: Array<{ category?: string; values?: BoardClue[] }> };
    dailyDoubleClueKeys?: Record<string, string[]>;
    ttsByClueKey?: Record<string, string>;
    ttsByAnswerKey?: Record<string, string>;
    ttsAssetIds?: string[];
    [key: string]: unknown;
  } | null;
  activeBoard?: string;
  selectedClue?: BoardClue | null;
  clearedClues?: Set<string>;
  buzzed?: string | null;
  buzzerLocked?: boolean;
  buzzLockouts?: Record<string, number>;
  clueState?: {
    clueKey?: string;
    lockedOut?: Record<string, boolean>;
    buzzOpenAtMs?: number;
    [key: string]: unknown;
  } | null;
  pendingBuzz?: {
    deadline: number;
    candidates: Array<{
      playerUsername: string;
      playerDisplayname: string;
      est: number;
      arrival: number;
      clientSeq: number;
      msgSeq: number;
    }>;
    timer: NodeJS.Timeout | null;
  } | null;
  phase?: string | null;
  selectorKey?: string | null;
  selectorName?: string | null;
  boardSelectionLocked?: boolean;
  boardSelectionLockReason?: string | null;
  boardSelectionLockVersion?: number;
  autoUnlockTimer?: NodeJS.Timeout | null;
  autoUnlockClueKey?: string | null;
  answeringPlayerUsername?: string | null;
  answeringPlayerKey?: string | null;
  answerSessionId?: string | null;
  answerClueKey?: string | null;
  answerTranscript?: string | null;
  answerVerdict?: string | null;
  answerConfidence?: number | null;
  timeToBuzz?: number;
  timeToAnswer?: number;
  welcomeTimer?: NodeJS.Timeout | null;
  welcomeEndsAt?: number | null;
  welcomeTtsAssetId?: string | null;
  aiHostTts?: {
    allAssetIds?: string[];
    slotAssets?: Record<string, string[]>;
    nameAssetsByPlayer?: Record<string, string>;
    categoryAssetsByCategory?: Record<string, string>;
    valueAssetsByValue?: Record<string, string>;
    [key: string]: unknown;
  } | null;
  aiHostPlayback?: {
    assetId: string;
    startedAtMs: number;
    durationMs?: number | null;
    endsAtMs?: number | null;
    clearTimer?: NodeJS.Timeout | null;
  } | null;
  finalJeopardyFinalists?: string[] | null;
  isFinalJeopardy?: boolean;
  finalJeopardyStage?: string | null;
  wagers?: Record<string, number>;
  finalWagerDrawings?: Record<string, string>;
  drawings?: Record<string, string>;
  finalPlacements?: string[];
  finalVerdicts?: Record<string, string>;
  finalTranscripts?: Record<string, string>;
  ddSnipeNext?: boolean;
  skipNextClue?: boolean;
  ddWagerSessionId?: string | null;
  ddWagerDeadlineAt?: number | null;
  dailyDouble?: {
    clueKey: string;
    boardKey?: string;
    playerUsername: string;
    playerDisplayname: string;
    stage?: string;
    wager?: number | null;
    maxWager?: number;
    attempts?: number;
    ddWagerSessionId?: string | null;
    ddWagerDeadlineAt?: number | null;
    [key: string]: unknown;
  } | null;
  usedDailyDoubles?: Set<string>;
  _ddWagerTimer?: NodeJS.Timeout | null;
  _buzzMsgSeq?: number;
  timerTimeout?: NodeJS.Timeout | null;
  timerVersion?: number | null;
  timerKind?: TimerKind | null;
  timerEndTime?: number | null;
  timerDuration?: number | null;
  answerTimer?: NodeJS.Timeout | null;
  answerDeadlineAt?: number | null;
  answerWindowMs?: number | null;
  answerWindowVersion?: number | null;
  cleanupTimer?: NodeJS.Timeout | null;
  emptySince?: number | null;
  gameReady?: {
    expected?: Record<string, boolean>;
    acks?: Record<string, boolean>;
    done?: boolean;
    [key: string]: unknown;
  } | null;
  preload?: {
    active?: boolean;
    required?: string[];
    requiredForToken?: string[];
    token?: number;
    finalToken?: number | null;
    acksByPlayer?: Record<string, number>;
    createdAt?: number;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export type GamesStore = Record<string, GameState>;

export type SocketAuth = {
  isAuthed: boolean;
  userId: string | null;
  role: Role | "default";
};

export type SocketState = WebSocket & {
  id: string;
  gameId?: string | null;
  isAlive?: boolean;
  auth?: SocketAuth;
};

type UnknownFn = (...args: unknown[]) => unknown;

export type WsContext = {
  games: GamesStore;
  repos: Record<string, unknown> & {
    profiles: Record<string, UnknownFn>;
    images?: Record<string, UnknownFn>;
    tts?: Record<string, UnknownFn>;
  };
  appConfig: { ai: { defaultModel: string; defaultSttProvider: string } };
  modelsByValue?: Record<string, { disabled?: boolean; price?: number }>;
  perms: { can: (ws: SocketState, permission: string, meta?: JsonMap) => boolean };

  broadcast: (gameId: string, payload: JsonMap) => void;
  broadcastAll: (payload: JsonMap) => void;
  scheduleLobbyCleanupIfEmpty: (gameId: string) => void;
  cancelLobbyCleanup: (game: GameState) => void;
  sendLobbySnapshot: (ws: SocketState, gameId: string) => void;
  buildLobbyState: (gameId: string, ws: SocketState) => JsonMap | null;
  getPlayerForSocket: (game: GameState, ws: SocketState) => PlayerState | null;
  startGameTimer: UnknownFn;
  clearGameTimer: UnknownFn;
  validateImportedBoardData: UnknownFn;
  parseBoardJson: UnknownFn;
  normalizeCategories11: UnknownFn;
  requireHost: UnknownFn;
  isHostSocket: UnknownFn;
  startAnswerWindow: UnknownFn;
  clearAnswerWindow: UnknownFn;
  transcribeAnswerAudio: UnknownFn;
  judgeClueAnswerFast: UnknownFn;
  judgeImage: UnknownFn;
  findCategoryForClue: UnknownFn;
  getGameOrFail: UnknownFn;
  ensureHostOrFail: UnknownFn;
  ensureLobbySettings: UnknownFn;
  normalizeRole: UnknownFn;
  resolveModelOrFail: UnknownFn;
  resolveVisualPolicy: UnknownFn;
  resetGenerationProgressAndNotify: UnknownFn;
  clearGenerationProgress: UnknownFn;
  safeAbortGeneration: UnknownFn;
  applyNewGameState: UnknownFn;
  getBoardDataOrFail: UnknownFn;
  ensureTtsAsset: UnknownFn;
  ensureBoardNarrationTtsForBoardData: UnknownFn;
  createTrace: UnknownFn;
  createBoardData: UnknownFn;
  submitWager: UnknownFn;
  submitDrawing: UnknownFn;
  submitWagerDrawing: UnknownFn;
  checkAllWagersSubmitted: UnknownFn;
  checkAllDrawingsSubmitted: UnknownFn;
  isBoardFullyCleared: UnknownFn;
  getCOTD: UnknownFn;
  collectImageAssetIdsFromBoard: UnknownFn;
  cancelAutoUnlock: UnknownFn;
  doUnlockBuzzerAuthoritative: UnknownFn;
  ensureAiHostTtsBank: UnknownFn;
  ensureAiHostValueTts: UnknownFn;
  playerStableId: UnknownFn;
  getBearerToken: UnknownFn;
  verifyAccessToken: UnknownFn;
  aiHostVoiceSequence: UnknownFn;
  aiHostSayByKey: UnknownFn;
  aiHostSayAsset: UnknownFn;
  verifyJwt: UnknownFn;
  setupPreloadHandshake: UnknownFn;
  initPreloadState: UnknownFn;
  broadcastPreloadBatch: UnknownFn;
  checkBoardTransition: UnknownFn;
  parseClueValue: UnknownFn;
  autoResolveAfterJudgement: UnknownFn;
  plannedVisualSlots: UnknownFn;
  makeLimiter: UnknownFn;
  populateCategoryVisuals: UnknownFn;
  parseDailyDoubleWager: UnknownFn;
  computeDailyDoubleMaxWager: UnknownFn;
  startDdWagerCapture: UnknownFn;
  repromptDdWager: UnknownFn;
  clearDdWagerTimer: UnknownFn;
  finalizeDailyDoubleWagerAndStartClue: UnknownFn;
  getTtsDurationMs: UnknownFn;
  sleep: UnknownFn;
  getClueKey: UnknownFn;
  normalizeName: UnknownFn;
  fireAndForget: UnknownFn;
  sleepAndCheckGame: UnknownFn;
  ensureFinalJeopardyAnswer: UnknownFn;
  ensureFinalJeopardyWager: UnknownFn;
};

export type HandlerArgs<TData extends JsonMap = JsonMap> = {
  ws: SocketState;
  data: TData;
  ctx: WsContext;
};
