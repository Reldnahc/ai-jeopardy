import type { LadderRole, Role } from "../../../../shared/roles.js";
import { atLeast, normalizeRole } from "../../../../shared/roles.js";

function asLadderRole(role: Role): LadderRole {
  // normalizeRole can return "banned"; atLeast() expects LadderRole
  return role === "banned" ? "default" : role;
}

export function getRoleGate(rawRole: unknown) {
  const role = normalizeRole(rawRole); // Role ("default" | ... | "banned")
  const ladder = asLadderRole(role);

  return {
    role,
    ladder,
    atLeast: (min: LadderRole) => atLeast(ladder, min),
  };
}
