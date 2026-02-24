import { describe, expect, it } from "vitest";
import type { GameState } from "../../types/runtime.js";
import {
  applyScore,
  displaynameFor,
  findPlayerByUsername,
  getActiveClueWorth,
  getDailyDoubleWagerIfActive,
  isDailyDoubleActiveForCurrentClue,
  normUsername,
  parseClueValue,
} from "./helpers.js";

describe("gameLogic helpers", () => {
  it("normalizes usernames", () => {
    expect(normUsername("  ALIce ")).toBe("alice");
    expect(normUsername(null)).toBe("");
  });

  it("finds player by normalized username and resolves displayname fallback", () => {
    const game = {
      players: [{ username: "Alice", displayname: "A" }],
    } as unknown as GameState;

    expect(findPlayerByUsername(game, " alice ")).toEqual({ username: "Alice", displayname: "A" });
    expect(findPlayerByUsername(game, "")).toBeNull();
    expect(displaynameFor(game, "alice")).toBe("A");
    expect(displaynameFor(game, "bob")).toBe("bob");
  });

  it("applies score deltas and initializes missing score map", () => {
    const game = {} as GameState;
    applyScore(game, "Alice", 200);
    applyScore(game, "alice", -50);
    applyScore(game, "", 100);

    expect(game.scores?.alice).toBe(150);
    expect(Object.keys(game.scores || {})).toEqual(["alice"]);
  });

  it("handles daily double wager resolution rules", () => {
    const base = {
      clueState: { clueKey: "k1" },
      dailyDouble: { clueKey: "k1", wager: 500 },
    } as unknown as GameState;

    expect(getDailyDoubleWagerIfActive(base)).toBe(500);
    expect(isDailyDoubleActiveForCurrentClue(base)).toBe(true);

    const wrongKey = {
      ...base,
      dailyDouble: { clueKey: "other", wager: 500 },
    } as unknown as GameState;
    expect(getDailyDoubleWagerIfActive(wrongKey)).toBeNull();

    const noClueKey = {
      ...base,
      clueState: { clueKey: "" },
    } as unknown as GameState;
    expect(getDailyDoubleWagerIfActive(noClueKey)).toBeNull();

    const badWager = {
      ...base,
      dailyDouble: { clueKey: "k1", wager: Number.NaN },
    } as unknown as GameState;
    expect(getDailyDoubleWagerIfActive(badWager)).toBeNull();
  });

  it("parses clue values and computes active clue worth", () => {
    const game = {
      selectedClue: { value: "$1,200" },
      clueState: { clueKey: "k1" },
    } as unknown as GameState;
    expect(parseClueValue("$1,200")).toBe(1200);
    expect(parseClueValue("abc")).toBe(0);
    expect(getActiveClueWorth(game)).toBe(1200);

    const ddGame = {
      ...game,
      dailyDouble: { clueKey: "k1", wager: 900 },
    } as unknown as GameState;
    expect(getActiveClueWorth(ddGame)).toBe(900);
  });
});
