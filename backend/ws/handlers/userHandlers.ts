import type { SocketState } from "../../types/runtime.js";
import type { Ctx } from "../context.types.js";
import type { PlayerState } from "../../types/runtime.js";

type HandlerArgs<TData extends Record<string, unknown> = Record<string, unknown>> = {
  ws: SocketState;
  data: TData;
  ctx: Ctx;
};
type HandlerFn<TData extends Record<string, unknown> = Record<string, unknown>> = (
  args: HandlerArgs<TData>,
) => Promise<unknown> | unknown;

type RequestTimeSyncData = { clientSentAt?: number };
type AuthData = { token?: string };
type RequestPlayerListData = { gameId: string };

export const userHandlers: Record<string, HandlerFn> = {
  ping: async ({ ws }: HandlerArgs) => {
    ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
  },
  "request-time-sync": async ({ ws, data }: HandlerArgs<RequestTimeSyncData>) => {
    const clientSentAt = Number(data?.clientSentAt || 0);
    ws.send(
      JSON.stringify({
        type: "send-time-sync",
        clientSentAt,
        serverNow: Date.now(),
      }),
    );
  },
  auth: async ({ ws, data, ctx }: HandlerArgs<AuthData>) => {
    const token = data?.token;

    if (!token) {
      ws.auth = { isAuthed: false, userId: null, role: "default" };
      ws.send(JSON.stringify({ type: "auth-result", ok: false }));
      return;
    }

    try {
      const payload = ctx.verifyJwt(token);
      const userId = payload?.sub;

      let role = payload?.role || "default";

      // Prefer DB role (prevents stale tokens)
      if (userId) {
        const dbRole = await ctx.repos.profiles.getRoleById(userId);
        if (dbRole) role = dbRole;
      }

      ws.auth = { isAuthed: true, userId, role };
      ws.send(JSON.stringify({ type: "auth-result", ok: true, role, userId }));
    } catch {
      ws.auth = { isAuthed: false, userId: null, role: "default" };
      ws.send(JSON.stringify({ type: "auth-result", ok: false }));
    }
  },
  "check-cotd": async ({ ws, ctx }: HandlerArgs) => {
    ws.send(
      JSON.stringify({
        type: "category-of-the-day",
        cotd: ctx.getCOTD(),
      }),
    );
  },
  "request-player-list": async ({ ws, data, ctx }: HandlerArgs<RequestPlayerListData>) => {
    const { gameId } = data;
    ws.send(
      JSON.stringify({
        type: "player-list-update",
        gameId,
        players: ctx.games[gameId].players.map((p: PlayerState) => ({
          username: p.username,
          displayname: p.displayname,
          online: p?.online,
        })),
        host: ctx.games[gameId].host,
      }),
    );
  },
};
