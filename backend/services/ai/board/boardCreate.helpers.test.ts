import { afterEach, describe, expect, it, vi } from "vitest";
import { makeProgressReporter } from "./boardTelemetry.js";
import {
  buildDailyDoubleClueKeys,
  resolveCreateBoardSettings,
  toBoardVisualSettings,
  trackNewTtsPromises,
} from "./boardCreate.helpers.js";

describe("boardCreate helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves board creation defaults and preserves overrides", () => {
    const settings = resolveCreateBoardSettings({
      includeVisuals: true,
      narrationEnabled: true,
      commonsThumbWidth: 900,
      ttsVoiceId: "openai:alloy",
    });

    expect(settings).toMatchObject({
      includeVisuals: true,
      narrationEnabled: true,
      commonsThumbWidth: 900,
      ttsVoiceId: "openai:alloy",
      imageProvider: "commons",
      maxVisualCluesPerCategory: 2,
      maxImageSearchTries: 6,
      preferPhotos: true,
      reasoningEffort: "off",
    });
    expect(toBoardVisualSettings(settings)).toEqual({
      includeVisuals: true,
      imageProvider: "commons",
      maxVisualCluesPerCategory: 2,
      maxImageSearchTries: 6,
      commonsThumbWidth: 900,
      preferPhotos: true,
    });
  });

  it("tracks newly appended tts promises against generation progress", async () => {
    const progress = makeProgressReporter();
    progress.setTotal(2);

    const ttsState = {
      ttsPromises: [Promise.resolve("a"), Promise.resolve("b")],
    };

    trackNewTtsPromises(ttsState, progress, 0);
    await Promise.all(ttsState.ttsPromises);

    expect(progress.done).toBe(2);
  });

  it("builds daily double clue pools from the generated boards", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const clueKeys = buildDailyDoubleClueKeys({
      firstBoard: {
        categories: [
          {
            category: "First",
            values: [
              { value: 200, question: "A", answer: "A1" },
              { value: 400, question: "B", answer: "B1" },
            ],
          },
        ],
      },
      secondBoard: {
        categories: [
          {
            category: "Second",
            values: [
              { value: 800, question: "C", answer: "C1" },
              { value: 1200, question: "D", answer: "D1" },
              { value: 1600, question: "E", answer: "E1" },
            ],
          },
        ],
      },
    });

    expect(clueKeys.firstBoard).toHaveLength(1);
    expect(clueKeys.secondBoard).toHaveLength(2);
    expect(clueKeys.firstBoard[0]).toMatch(/^firstBoard:/);
    expect(clueKeys.secondBoard.every((key) => key.startsWith("secondBoard:"))).toBe(true);
  });
});
