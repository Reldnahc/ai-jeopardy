import express from "express";
import { afterAll, describe, expect, it, vi } from "vitest";
import { registerBoardRoutes } from "./boardRoutes.js";

async function request(app: express.Express, path: string) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No address");
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
  const json = await res.json();
  server.close();
  return { status: res.status, json };
}

afterAll(() => {
  vi.restoreAllMocks();
});

describe("boardRoutes", () => {
  it("parses/clamps query and returns boards", async () => {
    const app = express();
    const listRecentBoards = vi.fn(async () => [{ id: 1 }]);
    registerBoardRoutes(app, { boards: { listRecentBoards } } as never);

    const out = await request(app, "/api/boards/recent?limit=999&offset=-5&model=%20gpt-4o%20");
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ boards: [{ id: 1 }] });
    expect(listRecentBoards).toHaveBeenCalledWith(50, 0, "gpt-4o");
  });

  it("returns 500 when repo throws", async () => {
    const app = express();
    registerBoardRoutes(
      app,
      { boards: { listRecentBoards: vi.fn(async () => Promise.reject(new Error("boom"))) } } as never,
    );

    const out = await request(app, "/api/boards/recent");
    expect(out.status).toBe(500);
    expect(out.json).toEqual({ error: "Failed to load recent boards" });
  });
});

