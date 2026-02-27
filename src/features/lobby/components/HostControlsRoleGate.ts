import { asLadderRole, LadderRole } from "../../../../shared/roles.js";
import { atLeast, normalizeRole } from "../../../../shared/roles.js";

export function getRoleGate(rawRole: unknown) {
  const role = normalizeRole(rawRole); // Role ("default" | ... | "banned")
  const ladder = asLadderRole(role);

  return {
    role,
    ladder,
    atLeast: (min: LadderRole) => atLeast(ladder, min),
  };
}
