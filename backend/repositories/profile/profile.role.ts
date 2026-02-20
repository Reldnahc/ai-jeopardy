// backend/repositories/profile/profile.role.ts
import type { Pool } from "pg";

export function createProfileRoleRepo(pool: Pool) {
  async function getRoleById(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;

    const { rows } = await pool.query<{ role: string }>(
      "select role from public.profiles where id = $1 limit 1",
      [userId],
    );

    return rows?.[0]?.role ?? null;
  }

  async function setRoleById(
    userId: string | null | undefined,
    roleRaw: unknown,
  ): Promise<{ ok: boolean; role: string | null }> {
    if (!userId) return { ok: false, role: null };

    const role = String(roleRaw ?? "")
      .trim()
      .toLowerCase();
    if (!role) return { ok: false, role: null };

    const { rows } = await pool.query<{ role: string }>(
      `
        update public.profiles
        set role = $2, updated_at = now()
        where id = $1
        returning role
      `,
      [userId, role],
    );

    return { ok: rows.length > 0, role: rows?.[0]?.role ?? null };
  }

  return { getRoleById, setRoleById };
}
