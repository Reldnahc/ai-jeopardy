// backend/repositories/profile/profile.auth.ts
import type { Pool } from "pg";
import type { LoginRow, PublicUserRow } from "./profile.types.js";
import { normalizeEmail, normalizeUsername } from "./profile.util.js";

export function createProfileAuthRepo(pool: Pool) {
  async function insertProfile(
    email: string | null | undefined,
    usernameRaw: string,
    displayname: string,
    passwordHash: string,
  ): Promise<PublicUserRow | null> {
    const username = normalizeUsername(usernameRaw);
    const emailNorm = normalizeEmail(email);

    const { rows } = await pool.query<PublicUserRow>(
      `
        with p as (
          insert into public.profiles (email, username, displayname, password_hash)
          values ($1, $2, $3, $4)
          returning id, email, username, displayname, role
        )
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
          c.font
        from p
        left join public.profile_customization c on c.profile_id = p.id
      `,
      [emailNorm, username, displayname, passwordHash],
    );

    return rows?.[0] ?? null;
  }

  async function getLoginRowByUsername(usernameRaw: string): Promise<LoginRow | null> {
    const username = normalizeUsername(usernameRaw);
    if (!username) return null;

    const { rows } = await pool.query<LoginRow>(
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
          c.font,

          p.password_hash
        from public.profiles p
        left join public.profile_customization c on c.profile_id = p.id
        where p.username = $1
        limit 1
      `,
      [username],
    );

    return rows?.[0] ?? null;
  }

  return { insertProfile, getLoginRowByUsername };
}
