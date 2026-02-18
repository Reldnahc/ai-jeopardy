// backend/auth/permissionManager.ts
import { atLeast, isBanned, normalizeRole } from "../../shared/roles.js";
import type { Role } from "../../shared/roles.js";
import type { WsLike } from "./wsTypes.js";
import type { Perm, PermissionContext } from "./permissions.js";
import { PERM_RULES } from "./permissions.js";

export type PermissionReason = "ok" | "banned" | "forbidden";

export type PermissionDecision = {
    ok: boolean;
    reason: PermissionReason;
    role: Role;
    perm: Perm;
};

export class PermissionManager {
    getRole(ws: WsLike): Role {
        return normalizeRole(ws.auth?.role);
    }

    decide(ws: WsLike, perm: Perm, data?: unknown): PermissionDecision {
        const role = this.getRole(ws);

        if (isBanned(role)) {
            return { ok: false, reason: "banned", role, perm };
        }

        const rule = PERM_RULES[perm];

        if ("minRole" in rule) {
            const ok = atLeast(role, rule.minRole);
            return ok
                ? { ok: true, reason: "ok", role, perm }
                : { ok: false, reason: "forbidden", role, perm };
        }

        const ctx: PermissionContext = { role, ws, data };
        const ok = rule.custom(ctx);

        return ok
            ? { ok: true, reason: "ok", role, perm }
            : { ok: false, reason: "forbidden", role, perm };
    }

    can(ws: WsLike, perm: Perm, data?: unknown): boolean {
        return this.decide(ws, perm, data).ok;
    }

    require(ws: WsLike, perm: Perm, data?: unknown): void {
        const decision = this.decide(ws, perm, data);
        if (decision.ok) return;

        const err = new Error(
            decision.reason === "banned"
                ? `Banned: ${decision.perm}`
                : `Forbidden: ${decision.perm} (role=${decision.role})`
        );

        (err as Error & { code?: "BANNED" | "FORBIDDEN" }).code =
            decision.reason === "banned" ? "BANNED" : "FORBIDDEN";

        throw err;
    }

    guard(ws: WsLike, perm: Perm, data?: unknown): boolean {
        const decision = this.decide(ws, perm, data);
        if (decision.ok) return true;

        ws.send(
            JSON.stringify({
                type: "error",
                code: decision.reason, // "banned" | "forbidden"
                perm: decision.perm,
            })
        );
        return false;
    }
}
