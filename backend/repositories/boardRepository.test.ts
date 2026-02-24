import { describe, expect, it, vi } from "vitest";
import { createBoardRepository } from "./boardRepository.js";

function makePool() {
  return {
    query: vi.fn(),
  };
}

describe("boardRepository", () => {
  it("throws when pool is missing", () => {
    expect(() => createBoardRepository(null as never)).toThrow("createBoardRepository: missing pool");
  });

  it("insertBoard runs insert query", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const repo = createBoardRepository(pool as never);

    await repo.insertBoard("u1", { title: "A" });

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("insert into public.jeopardy_boards"), [
      "u1",
      { title: "A" },
    ]);
  });

  it("listRecentBoards clamps limit/offset and maps createdAt", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [{ board: { title: "A" }, created_at: new Date("2026-01-01T00:00:00.000Z") }],
    });
    const repo = createBoardRepository(pool as never);

    const out = await repo.listRecentBoards(999, -9, "  gpt-4o  ");

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("from jeopardy_boards"), [50, 0, "gpt-4o"]);
    expect(out).toEqual([{ title: "A", createdAt: "2026-01-01T00:00:00.000Z" }]);
  });

  it("listRecentBoards defaults invalid model/date values", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [{ board: null, created_at: "" }],
    });
    const repo = createBoardRepository(pool as never);

    const out = await repo.listRecentBoards("x", "y", "   ");

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [10, 0, null]);
    expect(out).toEqual([{ createdAt: "" }]);
  });

  it("listBoardsByUsername normalizes username and maps rows", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [{ board: { id: 1 }, created_at: "2026-01-02T00:00:00.000Z" }],
    });
    const repo = createBoardRepository(pool as never);

    const out = await repo.listBoardsByUsername(" Alice ", 999, -1);

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("where p.username = $1"), ["alice", 50, 0]);
    expect(out).toEqual([{ id: 1, createdAt: "2026-01-02T00:00:00.000Z" }]);
  });
});

