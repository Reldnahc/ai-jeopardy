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
    url.searchParams.set("iiprop", "url|extmetadata|mime");
    url.searchParams.set("iiurlwidth", String(thumbWidth));
    url.searchParams.set("titles", fileTitles.join("|"));

    const data = await fetchJson(url.toString());

    return Object.values(data?.query?.pages ?? {})
        .map((p) => {
            const ii = p?.imageinfo?.[0];
            if (!ii) return null;

            const ext = ii.extmetadata ?? {};
            return {
                downloadUrl: ii.thumburl || ii.url,
                sourceUrl: ii.descriptionurl || null,
                mime: ii.mime || null,
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

export async function pickCommonsImageForQueries(queries, opts = {}) {
    const {
        searchLimit = 5,
        thumbWidth = 1600,
        maxQueries = 6,
        requireImageMime = true,
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
        const pick = infos.find((x) => {
            if (!x?.downloadUrl) return false;
            if (!requireImageMime) return true;
            return String(x.mime ?? "").startsWith("image/");
        });

        if (pick) {
            return {
                downloadUrl: pick.downloadUrl,
                sourceUrl: pick.sourceUrl,
                license: pick.license,
                licenseUrl: pick.licenseUrl,
                attribution: buildCommonsAttribution(pick),
            };
        }
    }
    trace?.mark("commons_pick_none");
    return null;
}
