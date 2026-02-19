// backend/repositories/profile/profile.read.ts
import type { Pool } from "pg";
import type { MeProfileRow, PublicProfileRow, PublicUserRow } from "./profile.types.js";
import { normalizeUsername } from "./profile.util.js";

export function createProfileReadRepo(pool: Pool) {
    async function getPublicUserById(userId: string | null | undefined): Promise<PublicUserRow | null> {
        if (!userId) return null;

        const { rows } = await pool.query<PublicUserRow>(
            `
        select
          p.id,
          p.email,
          p.username,
          p.role,
          p.displayname,

          c.color,
          c.text_color,
          c.name_color,
          c.border,
          c.border_color,
          c.background,
          c.background_color,
          c.font
        from public.profiles p
        left join public.profile_customization c on c.profile_id = p.id
        where p.id = $1
        limit 1
      `,
            [userId]
        );

        return rows?.[0] ?? null;
    }

    async function getMeProfile(userId: string | null | undefined): Promise<MeProfileRow | null> {
        if (!userId) return null;

        const { rows } = await pool.query<MeProfileRow>(
            `
        select
          p.id,
          p.email,
          p.username,
          p.role,
          p.displayname,
          p.tokens,

          c.bio,
          c.color,
          c.text_color,
          c.name_color,
          c.border,
          c.border_color,
          c.background,
          c.background_color,
          c.font,
          c.icon,

          s.games_finished,
          s.games_won,
          s.boards_generated,
          s.money_won,

          p.created_at,
          p.updated_at
        from public.profiles p
        left join public.profile_customization c on c.profile_id = p.id
        left join public.profile_statistics s on s.profile_id = p.id
        where p.id = $1
        limit 1
      `,
            [userId]
        );

        return rows?.[0] ?? null;
    }

    async function getPublicProfileByUsername(usernameRaw: string): Promise<PublicProfileRow | null> {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query<PublicProfileRow>(
            `
        select
          p.id,
          p.username,
          p.displayname,
          p.role,

          c.bio,
          c.color,
          c.text_color,
          c.name_color,
          c.border,
          c.border_color,
          c.background,
          c.background_color,
          c.font,
          c.icon,

          coalesce(s.games_played, 0) as games_played,
          coalesce(s.games_finished, 0) as games_finished,
          coalesce(s.games_won, 0) as games_won,
          coalesce(s.boards_generated, 0) as boards_generated,
          coalesce(s.money_won, 0) as money_won,

          coalesce(s.daily_double_found, 0) as daily_double_found,
          coalesce(s.daily_double_correct, 0) as daily_double_correct,
          coalesce(s.true_daily_doubles, 0) as true_daily_doubles,

          coalesce(s.final_jeopardy_participations, 0) as final_jeopardy_participations,
          coalesce(s.final_jeopardy_corrects, 0) as final_jeopardy_corrects,

          coalesce(s.clues_selected, 0) as clues_selected,
          coalesce(s.clues_skipped, 0) as clues_skipped,

          coalesce(s.times_buzzed, 0) as times_buzzed,
          coalesce(s.total_buzzes, 0) as total_buzzes,

          coalesce(s.correct_answers, 0) as correct_answers,
          coalesce(s.wrong_answers, 0) as wrong_answers,

          p.created_at,
          p.updated_at
        from public.profiles p
        left join public.profile_customization c on c.profile_id = p.id
        left join public.profile_statistics s on s.profile_id = p.id
        where p.username = $1
        limit 1
      `,
            [username]
        );

        return rows?.[0] ?? null;
    }

    async function getIdByUsername(usernameRaw: string): Promise<string | null> {
        const username = normalizeUsername(usernameRaw);
        if (!username) return null;

        const { rows } = await pool.query<{ id: string }>(
            `select id from public.profiles where username = $1 limit 1`,
            [username]
        );

        return rows?.[0]?.id ?? null;
    }

    async function getPublicProfilesByUsernames(
        usernamesRaw: Array<string | null | undefined>,
        opts?: { limit?: number }
    ): Promise<PublicProfileRow[]> {
        const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);

        const ordered: string[] = [];
        const seen = new Set<string>();

        for (const u of usernamesRaw ?? []) {
            const n = normalizeUsername(u);
            if (!n) continue;
            if (seen.has(n)) continue;
            seen.add(n);
            ordered.push(n);
            if (ordered.length >= limit) break;
        }

        if (ordered.length === 0) return [];

        const { rows } = await pool.query<PublicProfileRow>(
            `
        select
          p.id,
          p.username,
          p.displayname,
          p.role,

          c.bio,
          c.color,
          c.text_color,
          c.name_color,
          c.border,
          c.border_color,
          c.background,
          c.background_color,
          c.font,
          c.icon,

          coalesce(s.games_played, 0) as games_played,
          coalesce(s.games_finished, 0) as games_finished,
          coalesce(s.games_won, 0) as games_won,
          coalesce(s.boards_generated, 0) as boards_generated,
          coalesce(s.money_won, 0) as money_won,

          coalesce(s.daily_double_found, 0) as daily_double_found,
          coalesce(s.daily_double_correct, 0) as daily_double_correct,
          coalesce(s.true_daily_doubles, 0) as true_daily_doubles,

          coalesce(s.final_jeopardy_participations, 0) as final_jeopardy_participations,
          coalesce(s.final_jeopardy_corrects, 0) as final_jeopardy_corrects,

          coalesce(s.clues_selected, 0) as clues_selected,
          coalesce(s.clues_skipped, 0) as clues_skipped,

          coalesce(s.times_buzzed, 0) as times_buzzed,
          coalesce(s.total_buzzes, 0) as total_buzzes,

          coalesce(s.correct_answers, 0) as correct_answers,
          coalesce(s.wrong_answers, 0) as wrong_answers,

          p.created_at,
          p.updated_at
        from public.profiles p
        left join public.profile_customization c on c.profile_id = p.id
        left join public.profile_statistics s on s.profile_id = p.id
        where p.username = any($1::text[])
      `,
            [ordered]
        );

        const byUsername = new Map<string, PublicProfileRow>();
        for (const r of rows ?? []) {
            byUsername.set(normalizeUsername(r.username), r);
        }

        const out: PublicProfileRow[] = [];
        for (const u of ordered) {
            const r = byUsername.get(u);
            if (r) out.push(r);
        }

        return out;
    }

    return {
        getPublicUserById,
        getMeProfile,
        getPublicProfileByUsername,
        getIdByUsername,
        getPublicProfilesByUsernames,
    };
}
