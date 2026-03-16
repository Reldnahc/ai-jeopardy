import { describe, expect, it } from "vitest";
import {
  appendPendingUrls,
  buildAssetIdSetKey,
  collectImageAssetIds,
  computeBackoffMs,
  getUnrequestedUrls,
} from "./preload.helpers.ts";

describe("preload helpers", () => {
  it("collects unique image asset ids across the full board", () => {
    expect(
      collectImageAssetIds({
        firstBoard: {
          categories: [
            {
              category: "A",
              values: [
                { value: 200, question: "Q1", answer: "A1", media: { type: "image", assetId: " img-1 " } },
                { value: 400, question: "Q2", answer: "A2" },
              ],
            },
          ],
        },
        secondBoard: {
          categories: [
            {
              category: "B",
              values: [
                { value: 800, question: "Q3", answer: "A3", media: { type: "image", assetId: "img-2" } },
                { value: 1200, question: "Q4", answer: "A4", media: { type: "image", assetId: "img-1" } },
              ],
            },
          ],
        },
        finalJeopardy: {
          categories: [
            {
              category: "Final",
              values: [{ value: 0, question: "Q5", answer: "A5", media: { type: "image", assetId: "img-3" } }],
            },
          ],
        },
      }),
    ).toEqual(["img-1", "img-2", "img-3"]);
  });

  it("builds stable asset keys and capped retry backoff values", () => {
    expect(buildAssetIdSetKey(["b", "a", "c"])).toBe("a|b|c");
    expect(computeBackoffMs(0)).toBe(200);
    expect(computeBackoffMs(4)).toBe(1311);
    expect(computeBackoffMs(20)).toBe(2500);
  });

  it("appends only new pending urls and skips already-requested assets", () => {
    const toUrl = (id: string) => `/asset/${id}`;

    expect(
      appendPendingUrls({
        assetIds: ["a", "b", "a"],
        pendingUrls: ["/asset/existing"],
        requestedUrls: new Set(["/asset/b"]),
        toUrl,
      }),
    ).toEqual(["/asset/existing", "/asset/a"]);
  });

  it("returns only urls that have not already been requested", () => {
    expect(
      getUnrequestedUrls({
        assetIds: ["a", "b"],
        requestedUrls: new Set(["/asset/b"]),
        toUrl: (id) => `/asset/${id}`,
      }),
    ).toEqual(["/asset/a"]);
  });
});
