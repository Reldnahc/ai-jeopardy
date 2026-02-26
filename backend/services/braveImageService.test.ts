import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { BRAVE_API_KEY: "test-brave-key" },
}));

import {
  __resetBraveRateLimiterForTests,
  braveImageSearch,
  braveRateLimit,
  domainScore,
  normalizeBraveResult,
  pickBraveImageForQueries,
  safeHost,
  scoreBraveCandidate,
  urlExt,
} from "./braveImageService.js";

describe("braveImageService", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetBraveRateLimiterForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("normalizes payload variants and helper scorers", () => {
    expect(normalizeBraveResult(null)).toBeNull();
    expect(
      normalizeBraveResult({
        image: { url: "https://upload.wikimedia.org/pic.jpg", type: "image/jpeg", width: 2000, height: 1200 },
        page: { url: "https://en.wikipedia.org/wiki/Foo", title: "Foo photo" },
      }),
    ).toEqual({
      imageUrl: "https://upload.wikimedia.org/pic.jpg",
      sourceUrl: "https://en.wikipedia.org/wiki/Foo",
      title: "Foo photo",
      type: "image/jpeg",
      width: 2000,
      height: 1200,
    });

    expect(safeHost("https://en.wikipedia.org/wiki/Foo")).toBe("en.wikipedia.org");
    expect(safeHost("not-a-url")).toBe("");
    expect(urlExt("https://img.example/a.jpeg?x=1")).toBe("jpeg");
    expect(urlExt("https://img.example/no-extension")).toBe("");
    expect(urlExt("notaurl")).toBe("");
    expect(domainScore("upload.wikimedia.org")).toBeGreaterThan(0);
    expect(domainScore("cdninstagram.com")).toBeLessThan(0);

    const photo = {
      imageUrl: "https://upload.wikimedia.org/p/photo.jpeg",
      sourceUrl: "https://en.wikipedia.org/wiki/Photo",
      title: "Historic photograph",
      type: "image/jpeg",
      width: 1900,
      height: 1200,
    };
    const logo = {
      imageUrl: "https://pinimg.com/logo.svg",
      sourceUrl: "https://pinterest.com/pin/1",
      title: "brand logo vector",
      type: "image/svg+xml",
      width: 600,
      height: 600,
    };

    expect(scoreBraveCandidate(photo, { preferPhotos: true })).toBeGreaterThan(
      scoreBraveCandidate(logo, { preferPhotos: true }),
    );
    expect(
      normalizeBraveResult({
        image: { url: "https://img.example/a.jpg" },
        page_title: "Fallback Title",
      })?.title,
    ).toBe("Fallback Title");
    expect(normalizeBraveResult({ image: { url: "https://img.example/a.jpg" } })?.title).toBeNull();
    expect(
      scoreBraveCandidate(
        {
          imageUrl: "https://img.example/x.svg",
          sourceUrl: null,
          title: null,
          type: null,
          width: null,
          height: null,
        },
        { preferPhotos: false },
      ),
    ).toBeLessThan(0);
    expect(
      scoreBraveCandidate(
        {
          imageUrl: "https://img.example/a.jpg",
          sourceUrl: "https://src.example/a",
          title: "x",
          type: "image/jpeg",
          width: 1000,
          height: 1000,
        },
        { preferPhotos: false },
      ),
    ).toBeGreaterThan(0);
    expect(
      scoreBraveCandidate(
        {
          imageUrl: "https://img.example/a.webp",
          sourceUrl: "https://src.example/a",
          title: "x",
          type: "image/webp",
          width: 1000,
          height: 1000,
        },
        { preferPhotos: false },
      ),
    ).toBeGreaterThan(0);
  });

  it("rate limiter waits between calls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-26T12:00:00.000Z"));
    const trace = { mark: vi.fn() };

    await braveRateLimit(trace);
    const second = braveRateLimit(trace);
    await vi.advanceTimersByTimeAsync(1000);
    await second;

    expect(trace.mark).toHaveBeenCalledWith("brave_rate_limit_wait", { waitMs: 1000 });
  });

  it("braveImageSearch throws with status and body on API error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "service unavailable",
    });

    await expect(braveImageSearch("planets")).rejects.toThrow("Brave image search failed: 503 service unavailable");
  });

  it("pickBraveImageForQueries picks best and returns alternates", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            image: { url: "https://pinimg.com/logo.svg", type: "image/svg+xml", width: 800, height: 800 },
            page_url: "https://pinterest.com/pin/abc",
            title: "Logo icon",
          },
          {
            image: { url: "https://upload.wikimedia.org/cat.jpg", type: "image/jpeg", width: 2048, height: 1365 },
            page_url: "https://commons.wikimedia.org/wiki/File:Cat.jpg",
            title: "Cat photograph",
          },
          {
            image: { url: "https://i.imgur.com/cat.webp", type: "image/webp", width: 1800, height: 1200 },
            page_url: "https://imgur.com/a/cat",
            title: "Cat photo",
          },
        ],
      }),
    });
    const trace = { mark: vi.fn() };

    const out = await pickBraveImageForQueries(["  cats  "], { trace, maxAlternates: 2 });

    expect(out?.downloadUrl).toBe("https://upload.wikimedia.org/cat.jpg");
    expect(out?.attribution).toBe("Source: https://commons.wikimedia.org/wiki/File:Cat.jpg");
    expect(out?.alternates).toEqual([
      {
        downloadUrl: "https://i.imgur.com/cat.webp",
        sourceUrl: "https://imgur.com/a/cat",
        license: null,
        licenseUrl: null,
        attribution: "Source: https://imgur.com/a/cat",
      },
    ]);
    expect(trace.mark).toHaveBeenCalledWith(
      "brave_pick_scored",
      expect.objectContaining({ q: "cats", top: expect.any(Array) }),
    );
  });

  it("pickBraveImageForQueries handles data payload and no-result path", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ title: "missing image url" }],
      }),
    });

    const trace = { mark: vi.fn() };
    const out = await pickBraveImageForQueries(["example"], { trace });

    expect(out).toBeNull();
    expect(trace.mark).toHaveBeenCalledWith("brave_pick_none");
  });

  it("pickBraveImageForQueries handles missing queries and empty payload arrays", async () => {
    const trace = { mark: vi.fn() };
    expect(await pickBraveImageForQueries(undefined as unknown as string[], { trace })).toBeNull();

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect(await pickBraveImageForQueries(["topic"])).toBeNull();
  });

  it("pickBraveImageForQueries supports data shape and null attribution", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            image: { url: "https://img.example/pic.jpg", type: "image/jpeg", width: 1200, height: 800 },
            title: "plain photo",
          },
        ],
      }),
    });

    const out = await pickBraveImageForQueries(["topic"]);
    expect(out).toEqual({
      downloadUrl: "https://img.example/pic.jpg",
      sourceUrl: null,
      license: null,
      licenseUrl: null,
      attribution: null,
      alternates: [],
    });
  });

  it("pickBraveImageForQueries can skip results when maxAlternates is zero", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ image: { url: "https://img.example/pic.jpg", type: "image/jpeg" } }],
      }),
    });

    await expect(pickBraveImageForQueries(["topic"], { maxAlternates: 0 })).resolves.toBeNull();
  });
});
