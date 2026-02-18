// backend/repositories/index.ts
import type { Pool } from "pg";
import { createProfileRepository } from "./profile/profileRepository.js";
import { createBoardRepository } from "./boardRepository.js";
import { createImageAssetRepository } from "./imageAssetRepository.js";
import { createTtsAssetRepository } from "./ttsAssetRepository.js";

export type Repos = ReturnType<typeof createRepos>;

export function createRepos(pool: Pool) {
    if (!pool) throw new Error("createRepos: missing pool");

    return {
        profiles: createProfileRepository(pool),
        boards: createBoardRepository(pool),
        images: createImageAssetRepository(pool),
        tts: createTtsAssetRepository(pool),
    };
}
