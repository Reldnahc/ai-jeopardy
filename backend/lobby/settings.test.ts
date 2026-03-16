import { describe, expect, it } from "vitest";
import type { GameState, WsContext } from "../types/runtime.js";
import { createDefaultLobbySettings, ensureGameLobbySettings } from "./settings.js";

const aiConfig: WsContext["appConfig"]["ai"] = {
  defaultGenerationModel: "gpt-4o-mini",
  defaultSttProvider: "openai",
  defaultTtsProvider: "kokoro",
};

describe("lobby settings helpers", () => {
  it("createDefaultLobbySettings uses app defaults and enables narration by default", () => {
    expect(createDefaultLobbySettings(aiConfig)).toEqual({
      timeToBuzz: 10,
      timeToAnswer: 10,
      selectedModel: "gpt-4o-mini",
      reasoningEffort: "off",
      visualMode: "off",
      narrationEnabled: true,
      boardJson: "",
      sttProviderName: "openai",
      ttsProviderName: "kokoro",
      categoryRefreshLocked: false,
      categoryPoolPrompt: "",
    });
  });

  it("createDefaultLobbySettings allows narration to be disabled for game creation", () => {
    expect(createDefaultLobbySettings(aiConfig, { narrationEnabled: false })).toMatchObject({
      narrationEnabled: false,
      selectedModel: "gpt-4o-mini",
      sttProviderName: "openai",
      ttsProviderName: "kokoro",
    });
  });

  it("ensureGameLobbySettings preserves existing settings", () => {
    const existing = { selectedModel: "existing-model", narrationEnabled: false };
    const game: GameState = { lobbySettings: existing };

    const result = ensureGameLobbySettings(game, aiConfig);

    expect(result).toBe(existing);
    expect(game.lobbySettings).toBe(existing);
  });
});
