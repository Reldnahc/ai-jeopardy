// backend/http/routes.ts
import path from "path";
import type { Application, Request, Response } from "express";
import type { Repos } from "../repositories/index.js";

const TTS_CACHE_TTL_MS = 5 * 60 * 1000;

type TtsMetaCacheEntry = { storageKey: string; contentType: string; expiresAt: number };

const ttsMetaCache = new Map<string, TtsMetaCacheEntry>();
const ttsInFlight = new Map<string, Promise<{ storageKey: string; contentType: string }>>();

function getCachedTtsMeta(assetId: string): TtsMetaCacheEntry | null {
  const hit = ttsMetaCache.get(assetId);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    ttsMetaCache.delete(assetId);
    return null;
  }
  return hit;
}

function setCachedTtsMeta(assetId: string, storageKey: string, contentType: string) {
  ttsMetaCache.set(assetId, {
    storageKey,
    contentType,
    expiresAt: Date.now() + TTS_CACHE_TTL_MS,
  });
}

function isConnectTimeoutError(err: unknown): boolean {
  const e =
      typeof err === "object" && err !== null
          ? (err as { message?: unknown; details?: unknown })
          : {};

  const msg = String(e.message ?? "");
  const details = String(e.details ?? "");

  return (
      msg.includes("fetch failed") ||
      msg.includes("UND_ERR_CONNECT_TIMEOUT") ||
      details.includes("UND_ERR_CONNECT_TIMEOUT")
  );
}

type HttpRepos = Pick<Repos, "images" | "tts">;

type ByteRange = { start: number; end: number };

function parseRange(rangeHeader: string | undefined, total: number): ByteRange | null {
  // supports: "bytes=start-end" and "bytes=start-"
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const m = rangeHeader.replace("bytes=", "").split("-");

  const start = Number(m[0]);
  let end = m[1] ? Number(m[1]) : total - 1;

  if (!Number.isFinite(start) || start < 0) return null;
  if (!Number.isFinite(end) || end < start) end = total - 1;

  end = Math.min(end, total - 1);
  return { start, end };
}

type CodedError = Error & { code?: string };

// ✅ Typed params (first option)
type AssetIdParams = { assetId: string };

export function registerHttpRoutes(app: Application, distPath: string, repos: HttpRepos) {
  // --- Images --------------------------------------------------------------

  app.get("/api/images/:assetId", async (req: Request<AssetIdParams>, res: Response) => {
    try {
      const { assetId } = req.params; // ✅ string

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

  app.get("/api/image-assets/:assetId", async (req: Request<AssetIdParams>, res: Response) => {
    try {
      const { assetId } = req.params; // ✅ string

      const data = await repos.images.getImageMetaById(assetId);
      if (!data) return res.status(404).json({ error: "Image asset not found" });

      return res.json(data);
    } catch (e) {
      console.error("GET /api/image-assets/:assetId failed:", e);
      return res.status(500).json({ error: "Failed to load image meta" });
    }
  });

  app.get("/test/image/:assetId", async (req: Request<AssetIdParams>, res: Response) => {
    const { assetId } = req.params; // ✅ string

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`
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

  app.get("/api/tts/:assetId", async (req, res) => {
    const { assetId } = req.params;

    try {
      const row = await repos.tts.getBinaryById(assetId);
      if (!row?.data) return res.status(404).json({ error: "TTS asset not found" });

      const buf = row.data;
      const total = Number(row.bytes || buf.length);
      const contentType = row.content_type || "audio/wav";

      // ---- Cache headers (always) ----
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

      // ✅ Strong-ish validator:
      // If assetId is immutable (new id per new audio), this is enough.
      // If not immutable, include updated_at or a hash.
      const etag = `"tts-${assetId}-${total}"`;
      res.setHeader("ETag", etag);

      // ---- 304 support (no Range) ----
      // (Browsers use this to confidently reuse cached content)
      const ifNoneMatch = req.headers["if-none-match"];
      const wantsRange = typeof req.headers.range === "string" && req.headers.range.startsWith("bytes=");
      if (!wantsRange && ifNoneMatch === etag) {
        return res.status(304).end();
      }

      const range = req.headers.range;

      // ---- No Range: send full 200 ----
      if (!range) {
        res.setHeader("Content-Length", String(total));
        return res.status(200).end(buf);
      }

      // ---- If-Range handling ----
      // If client sends If-Range and it doesn't match, must send full body (200)
      const ifRange = req.headers["if-range"];
      if (typeof ifRange === "string" && ifRange.length > 0 && ifRange !== etag) {
        res.setHeader("Content-Length", String(total));
        return res.status(200).end(buf);
      }

      // ---- Range parse ----
      const r = parseRange(range, total);
      if (!r) return res.status(416).end();

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


  app.get("/api/tts-assets/:assetId", async (req: Request<AssetIdParams>, res: Response) => {
    const { assetId } = req.params; // ✅ string

    // 1) Cache hit
    const cached = getCachedTtsMeta(assetId);
    let storageKey: string;
    let contentType: string;

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
            const err: CodedError = new Error("TTS_NOT_FOUND");
            err.code = "TTS_NOT_FOUND";
            throw err;
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

        const err = e as CodedError;
        if (err?.code === "TTS_NOT_FOUND") {
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

    return res.json({ storage_key: storageKey, content_type: contentType });
  });

  app.get("/test/tts/:assetId", async (req: Request<AssetIdParams>, res: Response) => {
    const { assetId } = req.params; // ✅ string

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`
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

  app.get("*", (req: Request, res: Response) => {
    return res.sendFile(path.join(distPath, "index.html"));
  });
}
