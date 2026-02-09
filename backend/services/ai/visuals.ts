import { pickCommonsImageForQueries } from "../commonsService.js";
import { pickBraveImageForQueries } from "../braveImageService.js";
import { ingestImageToDbFromUrl } from "../imageAssetService.js";

type TraceLike = { mark: (event: string, meta?: Record<string, unknown>) => void };

export type VisualSettings = {
    includeVisuals: boolean;
    imageProvider: "commons" | "brave" | string;
    maxVisualCluesPerCategory: number;
    maxImageSearchTries: number;
    preferPhotos: boolean;
    trace?: TraceLike;
};

export type ProgressTick = (n?: number) => void;

export function plannedVisualSlots(settings: Pick<VisualSettings, "includeVisuals" | "maxVisualCluesPerCategory">) {
    if (!settings.includeVisuals) return 0;
    const maxPerCat = Number(settings.maxVisualCluesPerCategory ?? 0);
    if (!Number.isFinite(maxPerCat) || maxPerCat <= 0) return 0;
    return 10 * maxPerCat; // 5 + 5 categories
}

export function stripVisualWording(question: unknown) {
    return String(question ?? "")
        .replace(/\b(shown|pictured)\s+here\b/gi, "")
        .replace(/\b(in\s+the\s+image|in\s+this\s+(photo|picture))\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

export function makeLimiter(maxConcurrent: number) {
    let active = 0;
    const queue: Array<() => Promise<void>> = [];

    const runNext = () => {
        if (active >= maxConcurrent) return;
        const next = queue.shift();
        if (!next) return;
        active += 1;
        next().finally(() => {
            active -= 1;
            runNext();
        });
    };

    return <T>(fn: () => Promise<T>) =>
        new Promise<T>((resolve, reject) => {
            queue.push(() => fn().then(resolve, reject) as any);
            runNext();
        });
}

export async function populateCategoryVisuals(
    ctx: any,
    cat: any,
    settings: VisualSettings,
    progressTick?: ProgressTick
) {
    if (!settings.includeVisuals) return;

    const imageProvider = String(settings.imageProvider ?? "commons").toLowerCase();
    const pickImageForQueries =
        imageProvider === "brave" ? pickBraveImageForQueries : pickCommonsImageForQueries;

    const maxPerCategory = Number(settings.maxVisualCluesPerCategory ?? 0);
    const values = Array.isArray(cat?.values) ? cat.values : [];

    const visualClues = values
        .filter((c: any) => c?.visual?.commonsSearchQueries?.length)
        .slice(0, maxPerCategory);

    let attemptedSlots = 0;

    for (const clue of visualClues) {
        attemptedSlots += 1;
        try {
            const found = await pickImageForQueries(clue.visual.commonsSearchQueries, {
                maxQueries: settings.maxImageSearchTries,
                searchLimit: 5,
                preferPhotos: settings.preferPhotos,
                trace: settings.trace,
            });

            if (!found) {
                clue.question = stripVisualWording(clue.question);
                delete clue.visual;
                continue;
            }

            const assetId = await ingestImageToDbFromUrl(
                found.downloadUrl,
                {
                    sourceUrl: found.sourceUrl,
                    license: found.license,
                    licenseUrl: found.licenseUrl,
                    attribution: found.attribution,
                    trace: settings.trace,
                },
                ctx.repos
            );

            clue.media = { type: "image", assetId };
            delete clue.visual;
        } catch {
            clue.question = stripVisualWording(clue.question);
            delete clue.visual;
        } finally {
            progressTick?.(1);
        }
    }

    const remainingSlots = Math.max(0, maxPerCategory - attemptedSlots);
    if (remainingSlots > 0) progressTick?.(remainingSlots);

    for (const clue of values) {
        if (clue?.visual) delete clue.visual;
    }
}
