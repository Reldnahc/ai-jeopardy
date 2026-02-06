// backend/repositories/index.js
import { createProfileRepository } from "./profileRepository.js";
import { createBoardRepository } from "./boardRepository.js";
import { createImageAssetRepository } from "./imageAssetRepository.js";
import { createTtsAssetRepository } from "./ttsAssetRepository.js";

export function createRepos(pool) {
    if (!pool) throw new Error("createRepos: missing pool");

    return {
        profiles: createProfileRepository( pool ),
        boards: createBoardRepository( pool ),
        images: createImageAssetRepository( pool ),
        tts: createTtsAssetRepository( pool ),
    };
}
