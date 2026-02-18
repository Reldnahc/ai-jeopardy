// backend/repositories/profile/profile.customization.ts
import type { Pool } from "pg";
import type { CustomizationPatch, MeProfileRow } from "./profile.types.js";

export function createProfileCustomizationRepo(pool: Pool) {
    async function updateCustomization(
        userId: string | null | undefined,
        patch: CustomizationPatch
    ): Promise<MeProfileRow | null> {
        if (!userId) return null;

        const updates: string[] = [];
        const values: unknown[] = [];
        let i = 1;

        // allow null to clear bio/font/icon
        if ("bio" in patch) {
            updates.push(`bio = $${i++}`);
            values.push(patch.bio ?? null);
        }

        if (patch.color !== undefined) {
            updates.push(`color = $${i++}`);
            values.push(patch.color);
        }
        if (patch.text_color !== undefined) {
            updates.push(`text_color = $${i++}`);
            values.push(patch.text_color);
        }
        if (patch.name_color !== undefined) {
            updates.push(`name_color = $${i++}`);
            values.push(patch.name_color);
        }
        if (patch.border !== undefined) {
            updates.push(`border = $${i++}`);
            values.push(patch.border);
        }

        if ("font" in patch) {
            updates.push(`font = $${i++}`);
            values.push(patch.font ?? null);
        }
        if ("icon" in patch) {
            updates.push(`icon = $${i++}`);
            values.push(patch.icon ?? null);
        }

        if (updates.length === 0) return null;

        values.push(userId);

        const { rows } = await pool.query<MeProfileRow>(
            `
        with upd_c as (
          update public.profile_customization
          set ${updates.join(", ")}, updated_at = now()
          where profile_id = $${i}
          returning profile_id
        ),
        upd_p as (
          update public.profiles
          set updated_at = now()
          where id = (select profile_id from upd_c)
          returning id
        )
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
        where p.id = (select id from upd_p)
        limit 1
      `,
            values
        );

        return rows?.[0] ?? null;
    }

    return { updateCustomization };
}
