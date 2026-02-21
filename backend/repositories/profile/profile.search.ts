// backend/repositories/profile/profile.search.ts
import type { Pool } from "pg";
import type { SearchProfileRow } from "./profile.types.js";

export function createProfileSearchRepo(pool: Pool) {
  async function searchProfiles(q: unknown, limit: number = 5): Promise<SearchProfileRow[]> {
    const query = String(q ?? "").trim();
    if (!query || query.length < 2) return [];

    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 20) : 5;
    const like = `%${query}%`;

    const { rows } = await pool.query<SearchProfileRow>(
      `
        select
          p.username,
          p.displayname,

          c.color,
          c.icon,
          c.text_color,
          c.name_color,
          c.border,
          c.font
        from public.profiles p
        left join public.profile_customization c on c.profile_id = p.id
        where p.username ilike $1
           or p.displayname ilike $1
        order by
          case
            when p.username ilike $2 then 0
            when p.username ilike $1 then 1
            else 2
          end,
          p.username asc
        limit $3
      `,
      [like, `${query}%`, safeLimit],
    );

    return rows ?? [];
  }

  return { searchProfiles };
}
