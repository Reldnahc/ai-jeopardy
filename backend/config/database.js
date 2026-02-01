// backend/config/database.js
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.backend" });

function redactUrl(u) {
    return String(u)
        .replace(/(apikey=)[^&]+/gi, "$1<redacted>")
        .replace(/(access_token=)[^&]+/gi, "$1<redacted>");
}

function safeHeaders(headers) {
    if (!headers) return null;
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        if (typeof k !== "string") continue;
        const key = k.toLowerCase();
        if (key.includes("authorization") || key.includes("apikey")) {
            out[k] = "<redacted>";
        } else {
            out[k] = typeof v === "string" ? v : "<non-string>";
        }
    }
    return out;
}

function withTimeout(promise, ms, label) {
    if (!ms || ms <= 0) return promise;
    let t;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

const SUPABASE_SLOW_MS = Number(process.env.SUPABASE_SLOW_MS || 500);
const SUPABASE_TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS || 0); // 0 disables

async function verboseFetch(input, init) {
    const startedAt = Date.now();
    const reqId = `${startedAt}-${Math.random().toString(16).slice(2, 6)}`;

    const url = typeof input === "string" ? input : input?.url;
    const method = (init?.method || "GET").toUpperCase();

    // Keep log to path-ish so it’s readable
    let path = url;
    try {
        const u = new URL(url);
        path = `${u.origin}${u.pathname}`;
    } catch {
        path = redactUrl(url);
    }

    console.log(`[supabase][${reqId}] -> ${method} ${path}`, {
        // Don’t dump bodies; just headers (redacted)
        headers: safeHeaders(init?.headers),
    });

    try {
        const res = await withTimeout(fetch(input, init), SUPABASE_TIMEOUT_MS, `${method} ${path}`);
        const ms = Date.now() - startedAt;

        const level = ms >= SUPABASE_SLOW_MS ? "warn" : "log";
        console[level](
            `[supabase][${reqId}] <- ${res.status} (${ms}ms) ${ms >= SUPABASE_SLOW_MS ? "SLOW" : ""}`.trim()
        );

        return res;
    } catch (e) {
        const ms = Date.now() - startedAt;
        console.error(`[supabase][${reqId}] !! FAILED (${ms}ms) ${method} ${path}`, {
            error: String(e?.message ?? e),
            cause: e?.cause ? String(e.cause?.message ?? e.cause) : undefined,
        });
        throw e;
    }
}

export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        global: { fetch: verboseFetch },
        // auth: {
        //     persistSession: false,
        //     autoRefreshToken: false,
        //     detectSessionInUrl: false,
        // },
    }
);
