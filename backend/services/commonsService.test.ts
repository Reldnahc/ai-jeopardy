import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCommonsAttribution,
  commonsGetImageInfos,
  commonsSearchFiles,
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
});
