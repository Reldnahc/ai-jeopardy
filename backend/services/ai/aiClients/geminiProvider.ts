import { Buffer } from "node:buffer";

import { env } from "../../../config/env.js";
import { DEFAULT_JSON_SYSTEM_PROMPT, type AiCallOptions } from "./types.js";

type GeminiTextPart = { text: string };
type GeminiInlineDataPart = {
  inlineData: {
    mimeType: string;
    data: string;
  };
};
type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

function buildGeminiEndpoint(model: string, apiKey: string) {
  const baseUrl = (env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(
    /\/+$/,
    "",
  );
  return `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

async function createInlineImagePart(imageUrl: string): Promise<GeminiInlineDataPart> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Gemini image fetch failed: HTTP ${response.status}`);
  }

  const mimeType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    inlineData: {
      mimeType,
      data: bytes.toString("base64"),
    },
  };
}

async function buildUserParts(prompt: string, imageUrl?: string): Promise<GeminiPart[]> {
  const parts: GeminiPart[] = [{ text: prompt }];
  if (imageUrl) {
    parts.push(await createInlineImagePart(imageUrl));
  }
  return parts;
}

export async function callGeminiJson(model: string, prompt: string, options: AiCallOptions) {
  const apiKey = options.apiKeyOverride || env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for Gemini models.");
  }

  const response = await fetch(buildGeminiEndpoint(model, apiKey), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: String(options.systemPrompt ?? DEFAULT_JSON_SYSTEM_PROMPT).trim() }],
      },
      contents: [
        {
          role: "user",
          parts: await buildUserParts(prompt, options.image),
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${text || `HTTP ${response.status}`}`);
  }

  return response.json();
}
