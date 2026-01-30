import 'dotenv/config';

const BRAVE_IMAGES_ENDPOINT = "https://api.search.brave.com/res/v1/images/search";

// ---- global rate limiter (process-wide) ----
let nextAllowedAtMs = 0;
let limiterChain = Promise.resolve();

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ensures Brave API calls are rate-limited to 1 request / second across the whole Node process.
 * This queues concurrent callers behind a single shared chain.
 */
async function braveRateLimit(trace) {
    limiterChain = limiterChain.then(async () => {
        const now = Date.now();
        const waitMs = Math.max(0, nextAllowedAtMs - now);
        if (waitMs > 0) {
            trace?.mark?.("brave_rate_limit_wait", { waitMs });
            await sleep(waitMs);
        }
        nextAllowedAtMs = Date.now() + 1000;
    });
    await limiterChain;
}

function requireBraveToken() {
    const token = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
    if (!token) throw new Error("Missing BRAVE_API_KEY (or BRAVE_SEARCH_API_KEY) env var.");
    return token;
}

async function braveImageSearch(query, { count = 10, trace } = {}) {
    await braveRateLimit(trace);
    const token = requireBraveToken();

    const url = new URL(BRAVE_IMAGES_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    // url.searchParams.set("safesearch", "strict"); // optional

    trace?.mark?.("brave_image_search_start", { q: query, count });
    const t0 = Date.now();
    const r = await fetch(url.toString(), {
        headers: {
            "Accept": "application/json",
            "X-Subscription-Token": token,
        },
    });
    const ms = Date.now() - t0;

    if (!r.ok) {
        const body = await r.text().catch(() => "");
        trace?.mark?.("brave_image_search_fail", { q: query, status: r.status, ms, body: body.slice(0, 300) });
        throw new Error(`Brave image search failed: ${r.status} ${body}`);
    }

    const json = await r.json();
    trace?.mark?.("brave_image_search_end", { q: query, ms });
    return json;
}

function normalizeBraveResult(item) {
    if (!item || typeof item !== "object") return null;

    // Brave payloads have varied slightly; tolerate both shapes.
    const imageUrl =
        item.image?.url ||
        item.thumbnail?.url ||
        item.thumbnail?.src ||
        item.url ||
        null;

    const sourceUrl =
        item.page?.url ||
        item.page_url ||
        item.source ||
        item.url ||
        null;

    const title = item.title || item.page?.title || item.page_title || null;
    const type = item.image?.type || item.type || item.format || null;

    const width = item.image?.width ?? item.width ?? null;
    const height = item.image?.height ?? item.height ?? null;

    if (!imageUrl) return null;
    return { imageUrl, sourceUrl, title, type, width, height };
}

function safeHost(u) {
    try {
        return new URL(u).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function urlExt(u) {
    try {
        const p = new URL(u).pathname.toLowerCase();
        const m = p.match(/\.([a-z0-9]+)$/);
        return m ? m[1] : "";
    } catch {
        return "";
    }
}

function domainScore(host) {
    if (!host) return 0;
    if (host.endsWith("wikimedia.org") || host.endsWith("wikipedia.org")) return 80;

    const good = [
        "staticflickr.com",
        "live.staticflickr.com",
        "flickr.com",
        "smugmug.com",
        "imgur.com",
        "i.imgur.com",
        "upload.wikimedia.org",
        "cdn.britannica.com",
    ];
    for (const d of good) {
        if (host === d || host.endsWith(`.${d}`)) return 35;
    }

    const bad = [
        "pinterest.com",
        "pinimg.com",
        "instagram.com",
        "cdninstagram.com",
        "facebook.com",
        "fbcdn.net",
        "twitter.com",
        "twimg.com",
        "tiktok.com",
        "tiktokcdn.com",
        "gettyimages.com",
        "googleusercontent.com",
        "shutterstock.com",
        "istockphoto.com",
        "alamy.com",
        "dreamstime.com",
        "depositphotos.com",
    ];
    for (const d of bad) {
        if (host === d || host.endsWith(`.${d}`)) return -80;
    }

    return 0;
}

function scoreBraveCandidate(c, { preferPhotos }) {
    let score = 0;
    const t = String(c?.title ?? "").toLowerCase();
    const type = String(c?.type ?? "").toLowerCase();

    const imgHost = safeHost(c?.imageUrl);
    const srcHost = safeHost(c?.sourceUrl);
    const ext = urlExt(c?.imageUrl);

    score += domainScore(imgHost);
    if (srcHost && srcHost === imgHost) score += 5;

    const kind = type || ext;
    if (kind.includes("jpeg") || kind.includes("jpg")) score += preferPhotos ? 70 : 50;
    if (kind.includes("webp")) score += preferPhotos ? 65 : 45;
    if (kind.includes("png")) score += preferPhotos ? 35 : 35;
    if (kind.includes("svg")) score -= preferPhotos ? 60 : 10;
    if (kind.includes("gif")) score -= 30;

    if (!ext) score -= 12;
    if (String(c?.imageUrl ?? "").includes("?")) score -= 4;

    const stocky = ["getty", "shutterstock", "alamy", "istock", "depositphotos", "dreamstime", "stock photo", "stock image"];
    for (const w2 of stocky) if (t.includes(w2)) score -= 40;

    const bad = [
        "logo",
        "icon",
        "diagram",
        "map",
        "flag",
        "vector",
        "svg",
        "clipart",
        "infographic",
        "schematic",
        "chart",
        "graph",
        "symbol",
        "seal",
        "coat of arms",
    ];
    for (const wBad of bad) if (t.includes(wBad)) score -= 30;

    const good = ["dsc", "img_", "pict", "photo", "photograph", "jpg", "jpeg"];
    for (const wGood of good) if (t.includes(wGood)) score += 6;

    const w = typeof c?.width === "number" ? c.width : 0;
    const h = typeof c?.height === "number" ? c.height : 0;
    if (w && h) {
        if (w < 500 || h < 500) score -= 20;
        const mp = (w * h) / 1_000_000;
        score += Math.min(25, Math.round(mp * 4));

        const ar = w / h;
        if (ar >= 0.75 && ar <= 1.6) score += 10;
        else if (ar >= 0.6 && ar <= 2.0) score += 3;
        else score -= 8;
    } else {
        score -= 6;
    }

    if (!c?.imageUrl) score -= 999;

    return score;
}

/**
 * Returns:
 * { downloadUrl, sourceUrl, license, licenseUrl, attribution, alternates: [...] }
 *
 * Brave doesn't provide license metadata; attribution uses the sourceUrl.
 * Many sites block hotlinking; alternates let the caller try multiple URLs without extra Brave calls.
 */
export async function pickBraveImageForQueries(queries, opts = {}) {
    const {
        maxQueries = 6,
        searchLimit = 12,
        preferPhotos = true,
        maxAlternates = 5,
        trace,
    } = opts;

    const qList = (queries ?? [])
        .map((q) => String(q).trim())
        .filter(Boolean)
        .slice(0, maxQueries);

    trace?.mark?.("brave_pick_start", { queries: qList.slice(0, 3) });

    for (const q of qList) {
        const json = await braveImageSearch(q, { count: searchLimit, trace });

        const raw = Array.isArray(json?.results) ? json.results : (Array.isArray(json?.data) ? json.data : []);
        const candidates = raw.map(normalizeBraveResult).filter(Boolean);
        if (!candidates.length) continue;

        const scored = candidates
            .map((c) => ({ c, s: scoreBraveCandidate(c, { preferPhotos }) }))
            .sort((a, b) => b.s - a.s);

        const top = scored.slice(0, maxAlternates);
        const best = top[0]?.c ?? null;

        trace?.mark?.("brave_pick_scored", {
            q,
            top: top.slice(0, 3).map((x) => ({ score: x.s, title: x.c?.title ?? null, type: x.c?.type ?? null })),
        });

        if (!best?.imageUrl) continue;

        const mapOut = (cand) => ({
            downloadUrl: cand.imageUrl,
            sourceUrl: cand.sourceUrl,
            license: null,
            licenseUrl: null,
            attribution: cand.sourceUrl ? `Source: ${cand.sourceUrl}` : null,
        });

        const alternates = top
            .slice(1)
            .map((x) => x.c)
            .filter((c) => c?.imageUrl)
            .map(mapOut);

        return { ...mapOut(best), alternates };
    }

    trace?.mark?.("brave_pick_none");
    return null;
}
