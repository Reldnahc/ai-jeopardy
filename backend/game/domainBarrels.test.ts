import { describe, expect, it } from "vitest";
import * as dailyDouble from "./dailyDouble/dailyDouble.js";
import * as finalJeopardy from "./finalJeopardy/finalJeopardy.js";
import * as gameLogic from "./gameLogic/gameLogic.js";
import * as host from "./host/host.js";

describe("game domain barrel modules", () => {
  it("dailyDouble barrel exports expected functions", () => {
    expect(typeof dailyDouble.computeDailyDoubleMaxWager).toBe("function");
    expect(typeof dailyDouble.startDdWagerCapture).toBe("function");
    expect(typeof dailyDouble.repromptDdWager).toBe("function");
    expect(typeof dailyDouble.clearDdWagerTimer).toBe("function");
    expect(typeof dailyDouble.finalizeDailyDoubleWagerAndStartClue).toBe("function");
  });

  it("finalJeopardy barrel exports expected functions", () => {
    expect(typeof finalJeopardy.checkAllDrawingsSubmitted).toBe("function");
    expect(typeof finalJeopardy.checkAllWagersSubmitted).toBe("function");
    expect(typeof finalJeopardy.submitDrawing).toBe("function");
    expect(typeof finalJeopardy.submitWager).toBe("function");
    expect(typeof finalJeopardy.submitWagerDrawing).toBe("function");
  });

  it("gameLogic barrel exports expected functions", () => {
    expect(typeof gameLogic.parseClueValue).toBe("function");
    expect(typeof gameLogic.autoResolveAfterJudgement).toBe("function");
    expect(typeof gameLogic.cancelAutoUnlock).toBe("function");
    expect(typeof gameLogic.doUnlockBuzzerAuthoritative).toBe("function");
    expect(typeof gameLogic.findCategoryForClue).toBe("function");
  });

  it("host barrel exports expected functions", () => {
    expect(typeof host.ensureAiHostTtsBank).toBe("function");
    expect(typeof host.ensureAiHostValueTts).toBe("function");
    expect(typeof host.ensureFinalJeopardyAnswer).toBe("function");
    expect(typeof host.ensureFinalJeopardyWager).toBe("function");
    expect(typeof host.aiHostSayAsset).toBe("function");
    expect(typeof host.aiHostSayByAsset).toBe("function");
    expect(typeof host.aiHostSayByKey).toBe("function");
    expect(typeof host.aiHostVoiceSequence).toBe("function");
  });
});

