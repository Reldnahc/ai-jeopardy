import { beforeEach, describe, expect, it, vi } from "vitest";

const { containsProfanity } = vi.hoisted(() => ({
  containsProfanity: vi.fn(() => false),
}));

vi.mock("../services/profanityService.js", () => ({
  containsProfanity,
}));

import { buildProfileCustomizationPatch } from "./profileCustomization.js";

describe("profileCustomization helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    containsProfanity.mockReturnValue(false);
  });

  it("builds a customization patch for supported fields", () => {
    const result = buildProfileCustomizationPatch({
      bio: "Hello",
      font: "outfit",
      color: " #fff ",
      background_color: "#000",
    });

    expect(result).toEqual({
      ok: true,
      patch: {
        bio: "Hello",
        font: "outfit",
        color: "#fff",
        background_color: "#000",
      },
    });
  });

  it("preserves nullable fields for supported customization keys", () => {
    const result = buildProfileCustomizationPatch({
      bio: null,
      font: null,
      icon: null,
    });

    expect(result).toEqual({
      ok: true,
      patch: {
        bio: null,
        font: null,
        icon: null,
      },
    });
  });

  it("rejects profane bios", () => {
    containsProfanity.mockReturnValueOnce(true);

    expect(buildProfileCustomizationPatch({ bio: "bad bio" })).toEqual({
      ok: false,
      status: 400,
      error: "Bio contains prohibited language.",
    });
  });
});
