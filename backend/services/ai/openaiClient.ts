import OpenAI from "openai";
import { modelsByValue } from "../../../shared/models.js";

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export type OpenAiCallOptions = {
    reasoningEffort?: ReasoningEffort;
    image?: string;
};

const openai = new OpenAI();

function cleanJsonText(s: unknown) {
    return String(s ?? "").replace(/```(?:json)?/g, "").trim();
}

export function parseOpenAiJson<T = unknown>(response: unknown): T {
    const content =
        (response as any)?.choices?.[0]?.message?.content;

    if (!content) throw new Error("OpenAI response missing message content.");
    return JSON.parse(cleanJsonText(content)) as T;
}

export async function callOpenAiJson(model: string, prompt: string, options: OpenAiCallOptions = {}) {
    const modelDef = (modelsByValue as any)[model];
    const effort = options.reasoningEffort;
    const image = options.image;

    const includeReasoningEffort =
        modelDef?.supportsReasoningEffort === true &&
        (effort === "low" || effort === "medium" || effort === "high");

    const content = image
        ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
        ]
        : prompt;

    const payload: any = {
        model,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
    };

    if (includeReasoningEffort) {
        payload.reasoning_effort = effort;
    }

    return openai.chat.completions.create(payload);
}
