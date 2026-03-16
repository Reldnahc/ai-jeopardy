import { describe, expect, it, vi } from "vitest";
import {
  createInitialBoardData,
  getSocketClueKey,
  makeAiHostAssetPayload,
  normalizeSocketUsername,
  resolveScoreDelta,
} from "./useGameSocketSync.helpers.ts";

describe("useGameSocketSync helpers", () => {
  it("normalizes socket usernames", () => {
    expect(normalizeSocketUsername(" Alice ")).toBe("alice");
  });

  it("creates the default empty board shape", () => {
    expect(createInitialBoardData()).toEqual({
      firstBoard: { categories: [{ category: "", values: [] }] },
      secondBoard: { categories: [{ category: "", values: [] }] },
      finalJeopardy: { categories: [{ category: "", values: [] }] },
    });
  });

  it("builds AI host asset payloads with normalized offsets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00Z"));

    expect(
      makeAiHostAssetPayload({
        seq: 1,
        assetId: "asset-1",
        startedAtMs: 50,
        offsetMs: -4.4,
      }),
    ).toBe(`1::asset-1::50::0::${Date.now()}`);

    vi.useRealTimers();
  });

  it("creates clue keys from clue value and question", () => {
    expect(getSocketClueKey({ value: 200, question: " Question " })).toBe("200:Question");
    expect(getSocketClueKey({ value: 200, question: " " })).toBeNull();
  });

  it("resolves final jeopardy score deltas from wagers", () => {
    expect(
      resolveScoreDelta({
        player: "alice",
        delta: 100,
        isFinalJeopardy: true,
        allWagersSubmitted: true,
        wagers: { alice: 500 },
      }),
    ).toBe(500);

    expect(
      resolveScoreDelta({
        player: "alice",
        delta: -100,
        isFinalJeopardy: true,
        allWagersSubmitted: true,
        wagers: { alice: 500 },
      }),
    ).toBe(-500);
  });
});
