import type { PlayerState } from "../../types/runtime.js";
import { normalizeRole } from "../../../shared/roles.js";
import type { Role } from "../../../shared/roles.js";
import type { WsHandler, WsHandlerArgs } from "./types.js";
import type { CtxDeps } from "../context.types.js";

type RequestTimeSyncData = { clientSentAt?: number };
type AuthData = { token?: string };
type RequestPlayerListData = { gameId: string };

type UserHandlersCtx = CtxDeps<"verifyJwt" | "repos" | "getCOTD" | "games">;

export const userHandlers: Record<string, WsHandler> = {
  ping: async ({ ws }: WsHandlerArgs) => {
    ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
  },
  "request-time-sync": async ({ ws, data }: WsHandlerArgs<RequestTimeSyncData>) => {
    const clientSentAt = Number(data?.clientSentAt || 0);
    ws.send(
      JSON.stringify({
        type: "send-time-sync",
        clientSentAt,
        serverNow: Date.now(),
      }),
    );
  },
  auth: async ({ ws, data, ctx }: WsHandlerArgs<AuthData>) => {
    const hctx = ctx as UserHandlersCtx;
    const token = data?.token;

    if (!token) {
      ws.auth = { isAuthed: false, userId: null, role: "default" };
      ws.send(JSON.stringify({ type: "auth-result", ok: false }));
      return;
    }

    try {
      const payload = hctx.verifyJwt(token);
      const userId = payload?.sub;

      const toRole = (value: unknown): Role | "default" => normalizeRole(value);

      let role: Role | "default" = toRole(payload?.role);

      // Prefer DB role (prevents stale tokens)
      if (userId) {
        const dbRole = await hctx.repos.profiles.getRoleById(userId);
        if (dbRole) role = toRole(dbRole);
      }

      ws.auth = { isAuthed: true, userId, role };
      ws.send(JSON.stringify({ type: "auth-result", ok: true, role, userId }));
    } catch {
      ws.auth = { isAuthed: false, userId: null, role: "default" };
      ws.send(JSON.stringify({ type: "auth-result", ok: false }));
    }
  },
  "check-cotd": async ({ ws, ctx }: WsHandlerArgs) => {
    const hctx = ctx as UserHandlersCtx;
    ws.send(
      JSON.stringify({
        type: "category-of-the-day",
        cotd: hctx.getCOTD(),
      }),
    );
  },
  "request-player-list": async ({ ws, data, ctx }: WsHandlerArgs<RequestPlayerListData>) => {
    const hctx = ctx as UserHandlersCtx;
    const { gameId } = data;
    ws.send(
      JSON.stringify({
        type: "player-list-update",
        gameId,
        players: hctx.games[gameId].players.map((p: PlayerState) => ({
          username: p.username,
          displayname: p.displayname,
          online: p?.online,
        })),
        host: hctx.games[gameId].host,
      }),
    );
  },
};
