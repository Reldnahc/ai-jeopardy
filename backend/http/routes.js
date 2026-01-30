// backend/http/routes.js
import path from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { supabase } from "../config/database.js";
import { r2 } from "../services/r2Client.js";

/**
 * Registers all Express HTTP routes (GET endpoints + SPA fallback).
 * @param {import("express").Express} app
 * @param {{ distPath: string }} deps
 */
export function registerHttpRoutes(app, { distPath }) {
    // --- Images --------------------------------------------------------------

    app.get("/api/images/:assetId", async (req, res) => {
        try {
            const { assetId } = req.params;

            const { data, error } = await supabase
                .from("image_assets")
                .select("storage_key, content_type")
                .eq("id", assetId)
                .single();

            if (error || !data) {
                return res.status(404).json({ error: "Image asset not found" });
            }

            const storageKey = data.storage_key;
            const contentType = data.content_type || "image/webp";

            const cmd = new GetObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: storageKey,
            });

            const obj = await r2.send(cmd);

            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

            obj.Body.pipe(res);
        } catch (e) {
            console.error("GET /api/images/:assetId failed:", e);
            res.status(500).json({ error: "Failed to load image" });
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
          <h2>R2 Image Serve Test</h2>
          <p>assetId: <code>${assetId}</code></p>
          <p>URL: <code>/api/images/${assetId}</code></p>
          <img src="/api/images/${assetId}" alt="test image" />
        </body>
      </html>
    `);
    });

    app.get("/api/image-assets/:assetId", async (req, res) => {
        const { assetId } = req.params;

        const { data, error } = await supabase
            .from("image_assets")
            .select("*")
            .eq("id", assetId)
            .single();

        if (error || !data) return res.status(404).json({ error: "Not found" });
        res.json(data);
    });

    // --- SPA fallback --------------------------------------------------------

    app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });
}
