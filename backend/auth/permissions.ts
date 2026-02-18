// backend/auth/permissions.ts
import type { LadderRole, Role } from "../../shared/roles.js";
import type { WsLike } from "./wsTypes.js";

// Add/remove perms here as your app grows
export const PERMS = [
    "game:create",
    "game:host",
    "profiles:edit-any",
    "profiles:set-role",
    "profiles:set-admin",
    "profiles:set-head-admin",
    "profiles:ban",
    "admin:panel",
] as const;

export type Perm = typeof PERMS[number];

// Context your custom rules can use (no any)
export type PermissionContext = {
    role: Role;
    ws: WsLike;
    data?: unknown;
};

// Most perms are just "min role", but you can also have custom logic.
export type PermissionRule =
    | { minRole: LadderRole }
    | { custom: (ctx: PermissionContext) => boolean };

// Central policy table
export const PERM_RULES: Record<Perm, PermissionRule> = {
    "game:create": { minRole: "default" },
    "game:host": { minRole: "default" },

    "profiles:edit-any": { minRole: "admin" },
    "profiles:set-role": { minRole: "admin" },
    "profiles:set-admin": { minRole: "head_admin" },
    "profiles:set-head-admin": { minRole: "creator" },

    "profiles:ban": { minRole: "moderator" },

    "admin:panel": { minRole: "admin" },
};
