import { describe, expect, it } from "vitest";
import { inferAnswerType, isLikelyEquivalentFast, isTooGeneric } from "./heuristics.js";

describe("judge heuristics", () => {
  it("flags generic inputs", () => {
    expect(isTooGeneric("idk")).toBe(true);
    expect(isTooGeneric("i dont know")).toBe(true);
    expect(isTooGeneric("x")).toBe(true);
    expect(isTooGeneric("exoplanet")).toBe(false);
  });

  it("infers answer types", () => {
    expect(inferAnswerType("1969")).toBe("number");
    expect(inferAnswerType("The Matrix")).toBe("title");
    expect(inferAnswerType("Nile River")).toBe("place");
    expect(inferAnswerType("Albert Einstein")).toBe("person");
    expect(inferAnswerType("gravity")).toBe("thing");
  });

  it("matches equivalent normalized answers fast", () => {
    expect(isLikelyEquivalentFast("an exoplanet", "an exoplanet")).toBe(true);
    expect(isLikelyEquivalentFast("exoplanet", "an exoplanet")).toBe(true);
    expect(isLikelyEquivalentFast("an exoplanet", "an exoplaet")).toBe(true);
  });

  it("rejects risky non-equivalent matches", () => {
    expect(isLikelyEquivalentFast("a car", "a cat")).toBe(false);
    expect(isLikelyEquivalentFast("new yrok city", "new york city")).toBe(false);
    expect(isLikelyEquivalentFast("", "an exoplanet")).toBe(false);
  });
});

