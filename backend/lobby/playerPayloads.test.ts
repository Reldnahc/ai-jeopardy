import { describe, expect, it } from "vitest";
import { toPlayerPayload, toPlayerPayloads } from "./playerPayloads.js";

describe("player payload helpers", () => {
  it("treats missing online values as online", () => {
    expect(toPlayerPayload({ username: "alice", displayname: "Alice" })).toEqual({
      username: "alice",
      displayname: "Alice",
      online: true,
    });
  });

  it("serializes nullish player fields to empty strings", () => {
    expect(toPlayerPayload({ username: null, displayname: undefined, online: false })).toEqual({
      username: "",
      displayname: "",
      online: false,
    });
  });

  it("maps player arrays safely when players are missing", () => {
    expect(toPlayerPayloads(undefined)).toEqual([]);
  });
});
