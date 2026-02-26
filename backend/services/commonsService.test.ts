import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCommonsAttribution,
  commonsGetImageInfos,
  commonsSearchFiles,
  extractCommonsImageInfosFromResponse,
  isUsableCommonsImage,
  mimeScore,
  pickCommonsImageForQueries,
  pickBestCommonsImage,
  scoreCommonsCandidate,
  sizeScore,
  textPenalty,
} from "./commonsService.js";

describe("commonsService", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("commonsSearchFiles returns only truthy titles", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        query: {
          search: [{ title: "File:One.jpg" }, { title: null }, { title: "File:Two.png" }],
        },
      }),
    });

    const out = await commonsSearchFiles("space", 5);
    expect(out).toEqual(["File:One.jpg", "File:Two.png"]);
  });

  it("commonsSearchFiles and extract helpers handle empty payloads", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await expect(commonsSearchFiles("space", 5)).resolves.toEqual([]);
    expect(extractCommonsImageInfosFromResponse(undefined)).toEqual([]);
  });

  it("commonsGetImageInfos maps image metadata and skips missing imageinfo", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            "1": {
              title: "File:One.jpg",
              imageinfo: [
                {
                  thumburl: "https://img.example/one.jpg",
                  descriptionurl: "https://commons.example/one",
                  mime: "image/jpeg",
                  width: 2048,
                  height: 1365,
                  extmetadata: {
                    ImageDescription: { value: "Sample image" },
                    LicenseShortName: { value: "CC BY-SA 4.0" },
                    LicenseUrl: { value: "https://license.example" },
                    Artist: { value: "Jane" },
                    Credit: { value: "John" },
                  },
                },
              ],
            },
            "2": {
              title: "File:Missing.jpg",
            },
          },
        },
      }),
    });

    const out = await commonsGetImageInfos(["File:One.jpg", "File:Missing.jpg"], 1600);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      title: "File:One.jpg",
      downloadUrl: "https://img.example/one.jpg",
      sourceUrl: "https://commons.example/one",
      mime: "image/jpeg",
      width: 2048,
      height: 1365,
      description: "Sample image",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://license.example",
      artist: "Jane",
      credit: "John",
    });
  });

  it("buildCommonsAttribution composes available fields in order", () => {
    const out = buildCommonsAttribution({
      artist: "Jane",
      credit: "John",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://license.example",
      sourceUrl: "https://commons.example/one",
    });

    expect(out).toBe(
      "Artist: Jane | Credit: John | License: CC BY-SA 4.0 | License URL: https://license.example | Source: https://commons.example/one",
    );
    expect(buildCommonsAttribution({})).toBeNull();
  });

  it("extractCommonsImageInfosFromResponse falls back for description and url fields", () => {
    const out = extractCommonsImageInfosFromResponse({
      query: {
        pages: {
          "1": {
            title: "File:A.png",
            imageinfo: [
              {
                url: "https://img.example/a.png",
                extmetadata: {
                  ObjectName: { value: "Obj Name" },
                },
              },
            ],
          },
          "2": {
            title: "File:B.png",
            imageinfo: [
              {
                url: "https://img.example/b.png",
                extmetadata: {
                  Headline: { value: "Headline" },
                },
              },
            ],
          },
        },
      },
    });

    expect(out).toHaveLength(2);
    expect(out[0].downloadUrl).toBe("https://img.example/a.png");
    expect(out[0].description).toBe("Obj Name");
    expect(out[1].description).toBe("Headline");
    expect(
      extractCommonsImageInfosFromResponse({
        query: { pages: { "1": { imageinfo: [{ url: "https://img.example/no-title.png" }] } } },
      })[0].title,
    ).toBeNull();
  });

  it("scores and filters image candidates", () => {
    expect(mimeScore("image/jpeg", true)).toBeGreaterThan(mimeScore("image/svg+xml", true));
    expect(mimeScore(null, true)).toBeLessThan(0);
    expect(mimeScore("image/jpeg", false)).toBe(60);
    expect(mimeScore("image/svg+xml", false)).toBe(5);
    expect(sizeScore(400, 400)).toBeLessThan(0);
    expect(sizeScore(1920, 1080)).toBeGreaterThan(0);
    expect(textPenalty("Map of Europe", "diagram")).toBeLessThan(0);
    expect(textPenalty(null, null)).toBe(0);

    const photo = {
      title: "File:photo.jpg",
      downloadUrl: "https://img.example/photo.jpg",
      sourceUrl: null,
      mime: "image/jpeg",
      width: 1800,
      height: 1200,
      description: "Photograph",
      license: null,
      licenseUrl: null,
      artist: null,
      credit: null,
    };
    const logo = {
      title: "File:logo.svg",
      downloadUrl: "https://img.example/logo.svg",
      sourceUrl: null,
      mime: "image/svg+xml",
      width: 800,
      height: 800,
      description: "logo",
      license: null,
      licenseUrl: null,
      artist: null,
      credit: null,
    };

    expect(isUsableCommonsImage({ ...photo, downloadUrl: null }, true)).toBe(false);
    expect(isUsableCommonsImage({ ...photo, mime: "application/pdf" }, true)).toBe(false);
    expect(isUsableCommonsImage({ ...photo, mime: null }, true)).toBe(false);
    expect(isUsableCommonsImage({ ...photo, mime: "application/pdf" }, false)).toBe(true);
    expect(scoreCommonsCandidate(photo, { preferPhotos: true })).toBeGreaterThan(
      scoreCommonsCandidate(logo, { preferPhotos: true }),
    );

    const picked = pickBestCommonsImage([logo, photo], { requireImageMime: true, preferPhotos: true });
    expect(picked.best?.title).toBe("File:photo.jpg");
    expect(picked.bestScore).toBeGreaterThan(-Infinity);
  });

  it("pickCommonsImageForQueries returns null when no queries resolve to usable images", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { search: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { search: [{ title: "File:NoMime.bin" }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              "1": {
                title: "File:NoMime.bin",
                imageinfo: [{ url: "https://img.example/no-mime.bin", mime: "application/octet-stream" }],
              },
            },
          },
        }),
      });

    const trace = { mark: vi.fn() };
    const out = await pickCommonsImageForQueries(["q1", "q2"], { trace });

    expect(out).toBeNull();
    expect(trace.mark).toHaveBeenCalledWith("commons_pick_none");
  });

  it("pickCommonsImageForQueries chooses best candidate and builds attribution", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { search: [{ title: "File:Logo.svg" }, { title: "File:Photo.jpg" }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              "1": {
                title: "File:Logo.svg",
                imageinfo: [
                  {
                    url: "https://img.example/logo.svg",
                    mime: "image/svg+xml",
                    width: 900,
                    height: 900,
                    extmetadata: { ImageDescription: { value: "logo" } },
                  },
                ],
              },
              "2": {
                title: "File:Photo.jpg",
                imageinfo: [
                  {
                    thumburl: "https://img.example/photo.jpg",
                    descriptionurl: "https://commons.example/photo",
                    mime: "image/jpeg",
                    width: 2000,
                    height: 1300,
                    extmetadata: {
                      ImageDescription: { value: "photograph" },
                      Artist: { value: "Jane" },
                      LicenseShortName: { value: "CC BY" },
                    },
                  },
                ],
              },
            },
          },
        }),
      });

    const out = await pickCommonsImageForQueries(["planets"], { preferPhotos: true });
    expect(out).toEqual({
      downloadUrl: "https://img.example/photo.jpg",
      sourceUrl: "https://commons.example/photo",
      license: "CC BY",
      licenseUrl: null,
      attribution: "Artist: Jane | License: CC BY | Source: https://commons.example/photo",
    });
  });

  it("pickCommonsImageForQueries can accept non-image mime when requireImageMime is false", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { search: [{ title: "File:Asset.bin" }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              "1": {
                title: "File:Asset.bin",
                imageinfo: [
                  {
                    url: "https://img.example/asset.bin",
                    mime: "application/octet-stream",
                  },
                ],
              },
            },
          },
        }),
      });

    const out = await pickCommonsImageForQueries(["asset"], { requireImageMime: false, preferPhotos: false });
    expect(out?.downloadUrl).toBe("https://img.example/asset.bin");
  });

  it("pickCommonsImageForQueries handles missing queries input", async () => {
    const trace = { mark: vi.fn() };
    const out = await pickCommonsImageForQueries(undefined as unknown as string[], { trace });
    expect(out).toBeNull();
    expect(trace.mark).toHaveBeenCalledWith("commons_pick_start", { queries: [] });
    expect(trace.mark).toHaveBeenCalledWith("commons_pick_none");
  });
});
