// backend/repositories/profile/profile.leaderboard.ts
import type { Pool } from "pg";
import type { LeaderboardRow, LeaderboardStatKey } from "./profile.types.js";
import { normalizeUsername } from "./profile.util.js";

export function createProfileLeaderboardRepo(pool: Pool) {
    async function listLeaderboard(
        statRaw: unknown,
        limitRaw: unknown,
        offsetRaw: unknown
    ): Promise<LeaderboardRow[]> {
        const stat = String(statRaw ?? "").trim() as LeaderboardStatKey;

        const allowed = new Set<LeaderboardStatKey>([
            "money_won",
            "games_won",
            "games_finished",
            "correct_answers",
            "true_daily_doubles",
            "times_buzzed",
            "final_jeopardy_corrects",
            "daily_double_found",
            "daily_double_correct",
            "clues_selected",
        ]);

        const safeStat: LeaderboardStatKey = allowed.has(stat) ? stat : "money_won";

        const limitNum = Number(limitRaw ?? 25);
        const offsetNum = Number(offsetRaw ?? 0);

        const limit = Number.isFinite(limitNum) ? Math.min(Math.max(limitNum, 1), 100) : 25;
        const offset = Number.isFinite(offsetNum) ? Math.max(offsetNum, 0) : 0;

        const { rows } = await pool.query<LeaderboardRow>(
            `
        select
          p.username,
          p.displayname,
          coalesce(s.${safeStat}, 0)::float8 as value,

          coalesce(c.color, '#3b82f6') as color,
          coalesce(c.text_color, '#ffffff') as text_color,
          coalesce(c.name_color, '#111827') as name_color,
          coalesce(c.border, '') as border,
          c.font,
          c.icon
        from public.profile_statistics s
        join public.profiles p on p.id = s.profile_id
        left join public.profile_customization c on c.profile_id = p.id
        where coalesce(s.${safeStat}, 0) > 0
        order by coalesce(s.${safeStat}, 0) desc, p.username asc
        limit $1 offset $2
      `,
            [limit, offset]
        );

        return (rows ?? []).map((r) => ({
            ...r,
            username: normalizeUsername(r.username),
            displayname: String(r.displayname ?? r.username ?? "").trim(),
            value: Number(r.value ?? 0),
        }));
    }

    return { listLeaderboard };
}
