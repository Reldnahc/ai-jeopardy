// services/commonsService.js
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const UA = "AI-Jeopardy/1.0";

async function fetchJson(url) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`Commons API failed: ${r.status}`);
    return r.json();
}

export async function commonsSearchFiles(query, limit = 5) {
    const url = new URL(COMMONS_API);
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("list", "search");
    url.searchParams.set("srnamespace", "6"); // File:
    url.searchParams.set("srlimit", String(limit));
    url.searchParams.set("srsearch", query);

    const data = await fetchJson(url.toString());
    return (data?.query?.search ?? []).map((x) => x.title).filter(Boolean);
}

export async function commonsGetImageInfos(fileTitles, thumbWidth = 1600) {
    if (!fileTitles?.length) return [];

    const url = new URL(COMMONS_API);
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("prop", "imageinfo");
    // include size so we can score by width/height
    url.searchParams.set("iiprop", "url|extmetadata|mime|size");
    url.searchParams.set("iiurlwidth", String(thumbWidth));
    url.searchParams.set("titles", fileTitles.join("|"));

    const data = await fetchJson(url.toString());

    return Object.values(data?.query?.pages ?? {})
        .map((p) => {
            const ii = p?.imageinfo?.[0];
            if (!ii) return null;

            const ext = ii.extmetadata ?? {};
            const description =
                ext?.ImageDescription?.value ??
                ext?.ObjectName?.value ??
                ext?.Headline?.value ??
                null;

            return {
                title: p?.title ?? null,
                downloadUrl: ii.thumburl || ii.url,
                sourceUrl: ii.descriptionurl || null,
                mime: ii.mime || null,
                width: typeof ii.width === "number" ? ii.width : null,
                height: typeof ii.height === "number" ? ii.height : null,
                description,
                license: ext?.LicenseShortName?.value ?? null,
                licenseUrl: ext?.LicenseUrl?.value ?? null,
                artist: ext?.Artist?.value ?? null,
                credit: ext?.Credit?.value ?? null,
            };
        })
        .filter(Boolean);
}

export function buildCommonsAttribution(meta) {
    const parts = [];
    if (meta?.artist) parts.push(`Artist: ${meta.artist}`);
    if (meta?.credit) parts.push(`Credit: ${meta.credit}`);
    if (meta?.license) parts.push(`License: ${meta.license}`);
    if (meta?.licenseUrl) parts.push(`License URL: ${meta.licenseUrl}`);
    if (meta?.sourceUrl) parts.push(`Source: ${meta.sourceUrl}`);
    return parts.length ? parts.join(" | ") : null;
}

// --- scoring helpers (prefer photo-like assets) ---

function mimeScore(mime, preferPhotos) {
    const m = String(mime ?? "").toLowerCase();
    if (m === "image/jpeg") return preferPhotos ? 80 : 60;
    if (m === "image/webp") return preferPhotos ? 75 : 55;
    if (m === "image/png") return preferPhotos ? 55 : 55;
    if (m === "image/svg+xml") return preferPhotos ? -40 : 5;
    if (m === "image/gif") return preferPhotos ? -25 : -10;
    if (m.startsWith("image/")) return 20;
    return -999;
}

function textPenalty(title, description) {
    const t = `${title ?? ""} ${description ?? ""}`.toLowerCase();

    const bad = [
        "logo",
        "icon",
        "symbol",
        "diagram",
        "schematic",
        "map",
        "flag",
        "seal",
        "coat of arms",
        "coat_of_arms",
        "pictogram",
        "vector",
        "clipart",
        "infographic",
        "chart",
        "graph",
    ];

    let score = 0;
    for (const w of bad) {
        if (t.includes(w)) score -= 30;
    }

    const good = ["dsc", "img_", "pict", "photo", "photograph", "jpg", "jpeg"];
    for (const w of good) {
        if (t.includes(w)) score += 8;
    }

    return score;
}

function sizeScore(width, height) {
    const w = typeof width === "number" ? width : 0;
    const h = typeof height === "number" ? height : 0;
    if (!w || !h) return 0;

    if (w < 500 || h < 500) return -30;

    const mp = (w * h) / 1_000_000;
    const mpBoost = Math.min(40, Math.round(mp * 8));

    const ar = w / h;
    let arBoost = 0;
    if (ar >= 0.75 && ar <= 1.6) arBoost = 12;
    else if (ar >= 0.6 && ar <= 2.0) arBoost = 4;
    else arBoost = -8;

    return mpBoost + arBoost;
}

function scoreCommonsCandidate(info, { preferPhotos }) {
    let score = 0;
    score += mimeScore(info?.mime, preferPhotos);
    score += sizeScore(info?.width, info?.height);
    score += textPenalty(info?.title, info?.description);
    if (!info?.downloadUrl) score -= 999;
    return score;
}

export async function pickCommonsImageForQueries(queries, opts = {}) {
    const {
        searchLimit = 8,
        thumbWidth = 1600,
        maxQueries = 6,
        requireImageMime = true,
        preferPhotos = true,
        trace,
    } = opts;

    trace?.mark("commons_pick_start", { queries: (queries ?? []).slice(0, 3) });

    const qList = (queries ?? []).filter(Boolean).slice(0, maxQueries);

    for (const q of qList) {
        trace?.mark("commons_search_start", { q });
        const titles = await commonsSearchFiles(q, searchLimit);
        trace?.mark("commons_search_end", { q, results: titles.length });
        trace?.mark("commons_imageinfo_start", { q });
        const infos = await commonsGetImageInfos(titles, thumbWidth);
        trace?.mark("commons_imageinfo_end", { q, infos: infos.length });
        const imageInfos = infos.filter((x) => {
            if (!x?.downloadUrl) return false;
            if (!requireImageMime) return true;
            return String(x.mime ?? "").startsWith("image/");
        });

        if (!imageInfos.length) continue;

        let best = null;
        let bestScore = -Infinity;
        for (const info of imageInfos) {
            const s = scoreCommonsCandidate(info, { preferPhotos });
            if (s > bestScore) {
                bestScore = s;
                best = info;
            }
        }

        trace?.mark?.("commons_pick_scored", {
            q,
            bestScore,
            bestTitle: best?.title ?? null,
            bestMime: best?.mime ?? null,
            bestSize: best?.width && best?.height ? `${best.width}x${best.height}` : null,
        });

        if (best) {
            return {
                downloadUrl: best.downloadUrl,
                sourceUrl: best.sourceUrl,
                license: best.license,
                licenseUrl: best.licenseUrl,
                attribution: buildCommonsAttribution(best),
            };
        }
    }
    trace?.mark("commons_pick_none");
    return null;
}
