import { describe, expect, it } from "vitest";
import { numberToWords } from "./numberToWords.js";

describe("numberToWords", () => {
  it("converts zero and simple numbers", () => {
    expect(numberToWords(0)).toBe("zero");
    expect(numberToWords(7)).toBe("seven");
    expect(numberToWords(42)).toBe("forty two");
    expect(numberToWords(100)).toBe("one hundred");
    expect(numberToWords(219)).toBe("two hundred nineteen");
  });

  it("converts large numbers across thousands/millions/billions", () => {
    expect(numberToWords(1_005)).toBe("one thousand five");
    expect(numberToWords(2_000_019)).toBe("two million nineteen");
    expect(numberToWords(1_234_567_890)).toBe(
      "one billion two hundred thirty four million five hundred sixty seven thousand eight hundred ninety",
    );
  });

  it("converts negative numbers", () => {
    expect(numberToWords(-15)).toBe("minus fifteen");
    expect(numberToWords(-1_000)).toBe("minus one thousand");
  });

  it("throws on non-finite inputs", () => {
    expect(() => numberToWords(Number.NaN)).toThrow("finite number");
    expect(() => numberToWords(Number.POSITIVE_INFINITY)).toThrow("finite number");
    expect(() => numberToWords(Number.NEGATIVE_INFINITY)).toThrow("finite number");
  });
});
