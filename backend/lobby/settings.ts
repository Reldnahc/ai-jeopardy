import type { GameState, WsContext } from "../types/runtime.js";

type LobbyAiConfig = WsContext["appConfig"]["ai"];
type LobbySettings = NonNullable<GameState["lobbySettings"]>;

type LobbySettingsOptions = {
  narrationEnabled?: boolean;
};

export function createDefaultLobbySettings(
  aiConfig: LobbyAiConfig,
  options: LobbySettingsOptions = {},
): LobbySettings {
  const { narrationEnabled = true } = options;

  return {
    timeToBuzz: 10,
    timeToAnswer: 10,
    selectedModel: aiConfig.defaultGenerationModel,
    reasoningEffort: "off",
    visualMode: "off",
    narrationEnabled,
    boardJson: "",
    sttProviderName: aiConfig.defaultSttProvider,
    ttsProviderName: aiConfig.defaultTtsProvider,
    categoryRefreshLocked: false,
    categoryPoolPrompt: "",
  };
}

export function ensureGameLobbySettings(
  game: GameState,
  aiConfig: LobbyAiConfig,
  options: LobbySettingsOptions = {},
): LobbySettings {
  if (game.lobbySettings) return game.lobbySettings;

  game.lobbySettings = createDefaultLobbySettings(aiConfig, options);
  return game.lobbySettings;
}
