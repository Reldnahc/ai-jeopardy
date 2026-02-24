import { describe, expect, it } from "vitest";
import { isHostSocket, requireHost } from "./hostGuard.js";

describe("hostGuard", () => {
  it("isHostSocket returns true for matching host player id", () => {
    const game = {
      host: "alice",
      players: [
        { username: "alice", id: "sock-a" },
        { username: "bob", id: "sock-b" },
      ],
    };
    expect(isHostSocket(game as never, { id: "sock-a" } as never)).toBe(true);
  });

  it("isHostSocket returns false for mismatches", () => {
    const game = {
      host: "alice",
      players: [{ username: "alice", id: "sock-a" }],
    };
    expect(isHostSocket(game as never, { id: "sock-z" } as never)).toBe(false);
    expect(isHostSocket({ host: "nobody", players: [] } as never, { id: "x" } as never)).toBeUndefined();
  });

  it("requireHost handles nullish game safely", () => {
    expect(requireHost(null as never, { id: "x" } as never)).toBeNull();
    expect(requireHost(undefined as never, { id: "x" } as never)).toBeUndefined();
  });
});

