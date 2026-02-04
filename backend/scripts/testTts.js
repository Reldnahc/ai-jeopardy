import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { supabase } from "../config/database.js";
import { createTrace } from "../services/trace.js";
import { ensureTtsAsset } from "../services/ttsAssetService.js";

function parseArgs(argv) {
    const args = argv.slice(2);
    const out = {
        text: "",
        textType: "text", // "text" | "ssml"
        voiceId: "Matthew",
        engine: "standard",
        outputFormat: "mp3",
        languageCode: null,
    };

    // Allow: node ... "hello" --voice Joanna --ssml
    for (let i = 0; i < args.length; i++) {
        const a = args[i];

        if (!out.text && !a.startsWith("--")) {
            out.text = a;
            continue;
        }

        if (a === "--ssml") out.textType = "ssml";
        else if (a === "--text") out.textType = "text";
        else if (a === "--voice") out.voiceId = args[++i] || out.voiceId;
        else if (a === "--engine") out.engine = args[++i] || out.engine;
        else if (a === "--lang") out.languageCode = args[++i] || out.languageCode;
    }

    return out;
}

async function main() {
    const opts = parseArgs(process.argv);

    if (!opts.text || !opts.text.trim()) {
        console.error(
            'Usage:\n  node backend/scripts/testTts.js "For 200 dollars, this..." [--voice Matthew] [--ssml]\n'
        );
        process.exit(1);
    }

    const trace = createTrace("test-tts", {
        voiceId: opts.voiceId,
        textType: opts.textType,
        engine: opts.engine,
    });

    trace.mark("start");

    const asset = await ensureTtsAsset(
        {
            text: opts.text,
            textType: opts.textType,
            voiceId: opts.voiceId,
            engine: opts.engine,
            outputFormat: "mp3",
            languageCode: opts.languageCode,
        },
        supabase,
        trace
    );

    trace.mark("done", asset);
    trace.end();

    // If your server is running locally:
    const base = process.env.PUBLIC_BASE_URL || "http://localhost:5173";
    console.log("\n✅ TTS asset created/ensured:");
    console.log("assetId:", asset.id);
    console.log("sha256:", asset.sha256);
    console.log("storageKey:", asset.storageKey);
    console.log("playback URL:", `${base}/api/tts/${asset.id}`);
}

main().catch((e) => {
    console.error("testTts failed:", e);
    process.exit(1);
});
