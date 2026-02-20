// backend/repositories/profile/profileRepository.ts
import type { Pool } from "pg";

import { createProfileAuthRepo } from "./profile.auth.js";
import { createProfileCustomizationRepo } from "./profile.customization.js";
import { createProfileLeaderboardRepo } from "./profile.leaderboard.js";
import { createProfileReadRepo } from "./profile.read.js";
import { createProfileRoleRepo } from "./profile.role.js";
import { createProfileSearchRepo } from "./profile.search.js";
import { createProfileStatsRepo } from "./profile.stats.js";

export function createProfileRepository(pool: Pool) {
  if (!pool) throw new Error("createProfileRepository: missing pool");

  return {
    ...createProfileRoleRepo(pool),
    ...createProfileAuthRepo(pool),
    ...createProfileReadRepo(pool),
    ...createProfileSearchRepo(pool),
    ...createProfileCustomizationRepo(pool),
    ...createProfileLeaderboardRepo(pool),
    ...createProfileStatsRepo(pool),
  };
}
