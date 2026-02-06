// backend/http/routes.js
import path from "path";

const TTS_CACHE_TTL_MS = 5 * 60 * 1000;

const ttsMetaCache = new Map(); // assetId -> { storageKey, contentType, expiresAt }
const ttsInFlight = new Map();  // assetId -> Promise<{ storageKey, contentType }>

function getCachedTtsMeta(assetId) {
    const hit = ttsMetaCache.get(assetId);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        ttsMetaCache.delete(assetId);
        return null;
    }
    return hit;
}

function setCachedTtsMeta(assetId, storageKey, contentType) {
    ttsMetaCache.set(assetId, {
        storageKey,
        contentType,
        expiresAt: Date.now() + TTS_CACHE_TTL_MS,
    });
}

function isConnectTimeoutError(err) {
    const msg = String(err?.message || "");
    const details = String(err?.details || "");
    return (
        msg.includes("fetch failed") ||
        msg.includes("UND_ERR_CONNECT_TIMEOUT") ||
        details.includes("UND_ERR_CONNECT_TIMEOUT")
    );
}

export function registerHttpRoutes(app, distPath, repos ) {
    // --- Images --------------------------------------------------------------

    app.get("/api/images/:assetId", async (req, res) => {
        try {
            const { assetId } = req.params;

            const row = await repos.images.getImageBinaryById(assetId);
            if (!row?.data) return res.status(404).json({ error: "Image asset not found" });

            res.setHeader("Content-Type", row.content_type || "image/webp");
            res.setHeader("Content-Length", String(row.bytes || row.data.length));
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            return res.status(200).end(row.data);
        } catch (e) {
            console.error("GET /api/images/:assetId failed:", e);
            return res.status(500).json({ error: "Failed to load image" });
        }
    });

    app.get("/api/image-assets/:assetId", async (req, res) => {
        try {
            const { assetId } = req.params;

            const data = await repos.images.getImageMetaById(assetId);
            if (!data) return res.status(404).json({ error: "Image asset not found" });

            res.json(data);
        } catch (e) {
            console.error("GET /api/image-assets/:assetId failed:", e);
            return res.status(500).json({ error: "Failed to load image meta" });
        }
    });

    app.get("/test/image/:assetId", async (req, res) => {
        const { assetId } = req.params;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Image Test</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 24px; }
            img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }
            code { background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h2>Image Serve Test</h2>
          <p>assetId: <code>${assetId}</code></p>
          <p>URL: <code>/api/images/${assetId}</code></p>
          <img src="/api/images/${assetId}" alt="test image" />
        </body>
      </html>
    `);
    });

    // --- TTS -----------------------------------------------------------------

    function parseRange(rangeHeader, total) {
        // supports: "bytes=start-end" and "bytes=start-"
        if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
        const m = rangeHeader.replace("bytes=", "").split("-");

        let start = Number(m[0]);
        let end = m[1] ? Number(m[1]) : total - 1;

        if (!Number.isFinite(start) || start < 0) return null;
        if (!Number.isFinite(end) || end < start) end = total - 1;

        end = Math.min(end, total - 1);
        return { start, end };
    }

    app.get("/api/tts/:assetId", async (req, res) => {
        const { assetId } = req.params;

        try {
            const row = await repos.tts.getBinaryById(assetId);
            if (!row?.data) return res.status(404).json({ error: "TTS asset not found" });

            const buf = row.data;
            const total = Number(row.bytes || buf.length);
            const contentType = row.content_type || "audio/mpeg";

            res.setHeader("Content-Type", contentType);
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

            const r = parseRange(req.headers.range, total);
            if (!r) {
                res.setHeader("Content-Length", String(total));
                return res.status(200).end(buf);
            }

            const { start, end } = r;
            const chunk = buf.subarray(start, end + 1);

            res.status(206);
            res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
            res.setHeader("Content-Length", String(chunk.length));
            return res.end(chunk);
        } catch (e) {
            console.error("GET /api/tts/:assetId failed:", e);
            res.setHeader("Cache-Control", "no-store");
            return res.status(500).json({ error: "TTS endpoint failed" });
        }
    });

    app.get("/api/tts-assets/:assetId", async (req, res) => {
        const { assetId } = req.params;

        // 1) Cache hit
        const cached = getCachedTtsMeta(assetId);
        let storageKey;
        let contentType;

        if (cached) {
            storageKey = cached.storageKey;
            contentType = cached.contentType || "audio/mpeg";
        } else {
            // 2) In-flight dedupe (if 20 clients ask for same id, only 1 DB call)
            let p = ttsInFlight.get(assetId);

            if (!p) {
                p = (async () => {
                    const data = await repos.tts.getMetaById(assetId);

                    if (!data) {
                        const e = new Error("TTS_NOT_FOUND");
                        e.code = "TTS_NOT_FOUND";
                        throw e;
                    }

                    return {
                        storageKey: data.storage_key,
                        contentType: data.content_type || "audio/mpeg",
                    };
                })();

                ttsInFlight.set(assetId, p);
            }

            try {
                const meta = await p;
                storageKey = meta.storageKey;
                contentType = meta.contentType || "audio/mpeg";
                setCachedTtsMeta(assetId, storageKey, contentType);
            } catch (e) {
                // IMPORTANT: clear in-flight on failure so future calls can retry
                ttsInFlight.delete(assetId);

                if (e?.code === "TTS_NOT_FOUND") {
                    return res.status(404).json({ error: "TTS asset not found" });
                }

                if (isConnectTimeoutError(e)) {
                    res.setHeader("Cache-Control", "no-store");
                    return res.status(503).json({ error: "TTS lookup temporarily unavailable" });
                }

                console.error("Database error in /api/tts-assets:", e);
                return res.status(500).json({ error: "TTS lookup failed" });
            } finally {
                // On success, remove in-flight (cache now holds it)
                ttsInFlight.delete(assetId);
            }
        }

        res.json({ storage_key: storageKey, content_type: contentType });
    });

    app.get("/test/tts/:assetId", async (req, res) => {
        const { assetId } = req.params;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>TTS Test</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 24px; }
            code { background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h2>TTS Serve Test</h2>
          <p>assetId: <code>${assetId}</code></p>
          <p>URL: <code>/api/tts/${assetId}</code></p>
          <audio controls src="/api/tts/${assetId}"></audio>
        </body>
      </html>
    `);
    });

    // --- SPA fallback --------------------------------------------------------

    app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });
}
