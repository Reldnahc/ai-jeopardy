import { describe, expect, it } from "vitest";
import {
  PROFILE_TTL_MS,
  getErrorMessage,
  getMissingProfileUsernames,
  isFreshCacheEntry,
  mergeDefined,
  normalizeUsername,
  patchCachedProfile,
  readCachedProfile,
  upsertCachedProfile,
} from "./profileContext.helpers.ts";

type TestProfile = {
  id: string;
  username: string;
  displayname?: string;
  color?: string;
};

describe("profileContext helpers", () => {
  it("normalizes usernames and formats unknown errors", () => {
    expect(normalizeUsername(" Alice ")).toBe("alice");
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("plain")).toBe("plain");
  });

  it("mergeDefined only applies defined patch fields", () => {
    expect(mergeDefined({ a: 1, b: 2 }, { a: 3, b: undefined })).toEqual({ a: 3, b: 2 });
  });

  it("upserts and reads cached profiles", () => {
    const cache = upsertCachedProfile<TestProfile>({}, { id: "1", username: "Alice" }, 123);

    expect(readCachedProfile(cache, "alice")).toEqual({ id: "1", username: "Alice" });
    expect(cache.alice.cachedAt).toBe(123);
  });

  it("patches cached profiles without dropping existing fields", () => {
    const cache = {
      alice: {
        profile: { id: "1", username: "alice", displayname: "Alice" },
        cachedAt: 1,
      },
    };

    expect(patchCachedProfile(cache, "alice", { color: "#fff" }, 50)).toEqual({
      alice: {
        profile: { id: "1", username: "alice", displayname: "Alice", color: "#fff" },
        cachedAt: 50,
      },
    });
  });

  it("detects fresh cache entries and filters missing usernames", () => {
    const now = 10_000;
    const cache = {
      alice: {
        profile: { id: "1", username: "alice" },
        cachedAt: now - PROFILE_TTL_MS + 1,
      },
      bob: {
        profile: { id: "2", username: "bob" },
        cachedAt: now - PROFILE_TTL_MS - 1,
      },
    };

    expect(isFreshCacheEntry(cache.alice, now)).toBe(true);
    expect(isFreshCacheEntry(cache.bob, now)).toBe(false);
    expect(getMissingProfileUsernames(["Alice", "bob", "carol"], cache, now)).toEqual([
      "bob",
      "carol",
    ]);
  });
});
