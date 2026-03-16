export type LobbyBoardType = "firstBoard" | "secondBoard" | "finalJeopardy";

export type LobbyPlayerSummary = {
  username: string;
  displayname: string;
  online?: boolean;
};

export type LockedCategories = {
  firstBoard: boolean[];
  secondBoard: boolean[];
  finalJeopardy: boolean[];
};

export type LobbySettings = {
  timeToBuzz?: number;
  timeToAnswer?: number;
  selectedModel?: string;
  reasoningEffort?: "off" | "low" | "medium" | "high";
  visualMode?: "off" | "commons" | "brave";
  narrationEnabled?: boolean;
  boardJson?: string;
  sttProviderName?: "openai" | "whisper";
  ttsProviderName?: "kokoro" | "openai";
  categoryRefreshLocked?: boolean;
  categoryPoolPrompt?: string;
};

export type CategoryPoolState = {
  nextAllowedAtMs: number | null;
  lastGeneratedAtMs: number | null;
  generating: boolean;
};

export type CategoryOfTheDayPayload = {
  category: string;
  description: string;
};

export type LobbyInboundMessage = {
  type: string;
  [key: string]: unknown;
};

export type CategoryOfTheDayMessage = {
  type: "category-of-the-day";
  cotd: CategoryOfTheDayPayload;
};

export type LobbyCreatedMessage = {
  type: "lobby-created";
  gameId: string;
  categories: string[];
  players: LobbyPlayerSummary[];
  host: string;
};

export type CheckLobbyResponseMessage = {
  type: "check-lobby-response";
  isValid: boolean;
  isFull?: boolean;
  maxPlayers?: number;
  gameId: string;
};

export type SocketErrorMessage = {
  type: "error";
  message?: string;
};

export type PlayerListUpdateMessage = {
  type: "player-list-update";
  players: LobbyPlayerSummary[];
  host: string;
  gameId?: string;
};

export type LobbyStateMessage = {
  type: "lobby-state";
  gameId: string;
  players: LobbyPlayerSummary[];
  host: string | null;
  categories?: string[];
  inLobby?: boolean;
  isGenerating?: boolean;
  isLoading?: boolean;
  generationProgress?: number | null;
  generationDone?: number | null;
  generationTotal?: number | null;
  lockedCategories?: LockedCategories | null;
  you?: {
    isHost?: boolean;
    playerName?: string;
    playerKey?: string;
    username?: string;
    displayname?: string;
  } | null;
  lobbySettings?: LobbySettings | null;
  categoryPoolState?: Partial<CategoryPoolState> | null;
};

export type CategoryLockUpdatedMessage = {
  type: "category-lock-updated";
  boardType: LobbyBoardType;
  index: number;
  locked: boolean;
};

export type CategoryUpdatedMessage = {
  type: "category-updated";
  boardType: LobbyBoardType;
  index: number;
  value: string;
};

export type CategoriesUpdatedMessage = {
  type: "categories-updated";
  categories: string[];
};

export type LobbySettingsUpdatedMessage = {
  type: "lobby-settings-updated";
  gameId: string;
  lobbySettings: LobbySettings;
};

export type CategoryPoolStatusMessage = {
  type: "category-pool-status";
  nextAllowedAtMs?: number | null;
  lastGeneratedAtMs?: number | null;
  generating?: boolean;
};

export type GenerationProgressMessage = {
  type: "generation-progress";
  progress?: number;
  done?: number;
  total?: number;
};

export type CreateBoardFailedMessage = {
  type: "create-board-failed";
  message?: string;
};

export type PreloadImagesMessage = {
  type: "preload-images";
  assetIds?: string[];
  ttsAssetIds?: string[];
  token?: number;
  final?: boolean;
};

export type PreloadStartMessage = {
  type: "preload-start";
  token?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isBooleanArray(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.every(isBoolean);
}

export function isLobbyBoardType(value: unknown): value is LobbyBoardType {
  return value === "firstBoard" || value === "secondBoard" || value === "finalJeopardy";
}

export function isLobbyPlayerSummary(value: unknown): value is LobbyPlayerSummary {
  if (!isRecord(value)) return false;
  return (
    isString(value.username) &&
    isString(value.displayname) &&
    (value.online === undefined || isBoolean(value.online))
  );
}

export function isLockedCategories(value: unknown): value is LockedCategories {
  if (!isRecord(value)) return false;
  return (
    isBooleanArray(value.firstBoard) &&
    isBooleanArray(value.secondBoard) &&
    isBooleanArray(value.finalJeopardy)
  );
}

export function isLobbySettings(value: unknown): value is LobbySettings {
  if (!isRecord(value)) return false;

  return (
    (value.timeToBuzz === undefined || isFiniteNumber(value.timeToBuzz)) &&
    (value.timeToAnswer === undefined || isFiniteNumber(value.timeToAnswer)) &&
    (value.selectedModel === undefined || isString(value.selectedModel)) &&
    (value.reasoningEffort === undefined ||
      value.reasoningEffort === "off" ||
      value.reasoningEffort === "low" ||
      value.reasoningEffort === "medium" ||
      value.reasoningEffort === "high") &&
    (value.visualMode === undefined ||
      value.visualMode === "off" ||
      value.visualMode === "commons" ||
      value.visualMode === "brave") &&
    (value.narrationEnabled === undefined || isBoolean(value.narrationEnabled)) &&
    (value.boardJson === undefined || isString(value.boardJson)) &&
    (value.sttProviderName === undefined ||
      value.sttProviderName === "openai" ||
      value.sttProviderName === "whisper") &&
    (value.ttsProviderName === undefined ||
      value.ttsProviderName === "kokoro" ||
      value.ttsProviderName === "openai") &&
    (value.categoryRefreshLocked === undefined || isBoolean(value.categoryRefreshLocked)) &&
    (value.categoryPoolPrompt === undefined || isString(value.categoryPoolPrompt))
  );
}

function isCategoryPoolStateLike(value: unknown): value is Partial<CategoryPoolState> {
  if (!isRecord(value)) return false;
  return (
    (value.nextAllowedAtMs === undefined || isNullableFiniteNumber(value.nextAllowedAtMs)) &&
    (value.lastGeneratedAtMs === undefined || isNullableFiniteNumber(value.lastGeneratedAtMs)) &&
    (value.generating === undefined || isBoolean(value.generating))
  );
}

export function isCategoryOfTheDayMessage(
  message: LobbyInboundMessage,
): message is CategoryOfTheDayMessage {
  if (message.type !== "category-of-the-day" || !isRecord(message.cotd)) return false;
  return isString(message.cotd.category) && isString(message.cotd.description);
}

export function isLobbyCreatedMessage(
  message: LobbyInboundMessage,
): message is LobbyCreatedMessage {
  return (
    message.type === "lobby-created" &&
    isString(message.gameId) &&
    isStringArray(message.categories) &&
    Array.isArray(message.players) &&
    message.players.every(isLobbyPlayerSummary) &&
    isString(message.host)
  );
}

export function isCheckLobbyResponseMessage(
  message: LobbyInboundMessage,
): message is CheckLobbyResponseMessage {
  return (
    message.type === "check-lobby-response" &&
    isString(message.gameId) &&
    isBoolean(message.isValid) &&
    (message.isFull === undefined || isBoolean(message.isFull)) &&
    (message.maxPlayers === undefined || isFiniteNumber(message.maxPlayers))
  );
}

export function isSocketErrorMessage(
  message: LobbyInboundMessage,
): message is SocketErrorMessage {
  return message.type === "error" && (message.message === undefined || isString(message.message));
}

export function isPlayerListUpdateMessage(
  message: LobbyInboundMessage,
): message is PlayerListUpdateMessage {
  return (
    message.type === "player-list-update" &&
    Array.isArray(message.players) &&
    message.players.every(isLobbyPlayerSummary) &&
    isString(message.host) &&
    (message.gameId === undefined || isString(message.gameId))
  );
}

export function isLobbyStateMessage(message: LobbyInboundMessage): message is LobbyStateMessage {
  return (
    message.type === "lobby-state" &&
    isString(message.gameId) &&
    Array.isArray(message.players) &&
    message.players.every(isLobbyPlayerSummary) &&
    (message.host === null || isString(message.host)) &&
    (message.categories === undefined || isStringArray(message.categories)) &&
    (message.inLobby === undefined || isBoolean(message.inLobby)) &&
    (message.isGenerating === undefined || isBoolean(message.isGenerating)) &&
    (message.isLoading === undefined || isBoolean(message.isLoading)) &&
    (message.generationProgress === undefined ||
      isNullableFiniteNumber(message.generationProgress)) &&
    (message.generationDone === undefined || isNullableFiniteNumber(message.generationDone)) &&
    (message.generationTotal === undefined || isNullableFiniteNumber(message.generationTotal)) &&
    (message.lockedCategories === undefined ||
      message.lockedCategories === null ||
      isLockedCategories(message.lockedCategories)) &&
    (message.you === undefined ||
      message.you === null ||
      (isRecord(message.you) &&
        (message.you.isHost === undefined || isBoolean(message.you.isHost)) &&
        (message.you.playerName === undefined || isString(message.you.playerName)) &&
        (message.you.playerKey === undefined || isString(message.you.playerKey)) &&
        (message.you.username === undefined || isString(message.you.username)) &&
        (message.you.displayname === undefined || isString(message.you.displayname)))) &&
    (message.lobbySettings === undefined ||
      message.lobbySettings === null ||
      isLobbySettings(message.lobbySettings)) &&
    (message.categoryPoolState === undefined ||
      message.categoryPoolState === null ||
      isCategoryPoolStateLike(message.categoryPoolState))
  );
}

export function isCategoryLockUpdatedMessage(
  message: LobbyInboundMessage,
): message is CategoryLockUpdatedMessage {
  return (
    message.type === "category-lock-updated" &&
    isLobbyBoardType(message.boardType) &&
    isFiniteNumber(message.index) &&
    isBoolean(message.locked)
  );
}

export function isCategoryUpdatedMessage(
  message: LobbyInboundMessage,
): message is CategoryUpdatedMessage {
  return (
    message.type === "category-updated" &&
    isLobbyBoardType(message.boardType) &&
    isFiniteNumber(message.index) &&
    isString(message.value)
  );
}

export function isCategoriesUpdatedMessage(
  message: LobbyInboundMessage,
): message is CategoriesUpdatedMessage {
  return message.type === "categories-updated" && isStringArray(message.categories);
}

export function isLobbySettingsUpdatedMessage(
  message: LobbyInboundMessage,
): message is LobbySettingsUpdatedMessage {
  return (
    message.type === "lobby-settings-updated" &&
    isString(message.gameId) &&
    isLobbySettings(message.lobbySettings)
  );
}

export function isCategoryPoolStatusMessage(
  message: LobbyInboundMessage,
): message is CategoryPoolStatusMessage {
  return message.type === "category-pool-status" && isCategoryPoolStateLike(message);
}

export function isGenerationProgressMessage(
  message: LobbyInboundMessage,
): message is GenerationProgressMessage {
  return (
    message.type === "generation-progress" &&
    (message.progress === undefined || isFiniteNumber(message.progress)) &&
    (message.done === undefined || isFiniteNumber(message.done)) &&
    (message.total === undefined || isFiniteNumber(message.total))
  );
}

export function isCreateBoardFailedMessage(
  message: LobbyInboundMessage,
): message is CreateBoardFailedMessage {
  return (
    message.type === "create-board-failed" &&
    (message.message === undefined || isString(message.message))
  );
}

export function isPreloadImagesMessage(
  message: LobbyInboundMessage,
): message is PreloadImagesMessage {
  return (
    message.type === "preload-images" &&
    (message.assetIds === undefined || isStringArray(message.assetIds)) &&
    (message.ttsAssetIds === undefined || isStringArray(message.ttsAssetIds)) &&
    (message.token === undefined || isFiniteNumber(message.token)) &&
    (message.final === undefined || isBoolean(message.final))
  );
}

export function isPreloadStartMessage(
  message: LobbyInboundMessage,
): message is PreloadStartMessage {
  return message.type === "preload-start" && (message.token === undefined || isFiniteNumber(message.token));
}
