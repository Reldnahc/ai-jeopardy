import { describe, expect, it } from "vitest";
import * as dailyDouble from "./dailyDouble/dailyDouble.js";
import { finalizeDailyDoubleWagerAndStartClue } from "./dailyDouble/finalize.js";
import * as finalJeopardy from "./finalJeopardy/finalJeopardy.js";
import { submitWager } from "./finalJeopardy/submissions.js";
import * as gameLogic from "./gameLogic/gameLogic.js";
import { doUnlockBuzzerAuthoritative } from "./gameLogic/buzzer.js";
import * as host from "./host/host.js";
import { aiHostSayAsset } from "./host/playback.js";

describe("game barrel exports", () => {
  it("re-exports dailyDouble members", () => {
    expect(dailyDouble.finalizeDailyDoubleWagerAndStartClue).toBe(finalizeDailyDoubleWagerAndStartClue);
  });

  it("re-exports finalJeopardy members", () => {
    expect(finalJeopardy.submitWager).toBe(submitWager);
  });

  it("re-exports gameLogic members", () => {
    expect(gameLogic.doUnlockBuzzerAuthoritative).toBe(doUnlockBuzzerAuthoritative);
  });

  it("re-exports host members", () => {
    expect(host.aiHostSayAsset).toBe(aiHostSayAsset);
  });
});
