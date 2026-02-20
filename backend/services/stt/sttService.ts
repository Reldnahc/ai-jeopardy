// backend/services/sttService.ts
import { getSttProvider } from "./provider.js";
import { SttProviderName } from "./types.js";
import { buildExpectedAnswerPrompt } from "./prompt.js";
import { rethrowAsSttError } from "./providers/openai.js"; // only used for nicer OpenAI errors

function safeJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

/**
 * Two-pass STT:
 *  1) Probe (language-agnostic, no prompt) to see if we have comprehensible speech at all
 *  2) If probe looks valid AND we have a prompt, run biased pass (language=en + prompt)
 *
 * If WHISPER_URL is set, both passes go through your custom service.
 * Otherwise, both passes go through OpenAI.
 */
export async function transcribeAnswerAudio(
  buffer: Buffer,
  mimeType: string,
  context: unknown,
  providerName: SttProviderName,
): Promise<string> {
  const provider = getSttProvider(providerName);

  const model = "gpt-4o-mini-transcribe"; // used by OpenAI provider; ignored by whisper-url provider
  const ct = String(mimeType || "audio/webm");

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("transcribeAnswerAudio: missing/empty buffer");
  }

  const prompt = buildExpectedAnswerPrompt(context);

  console.log("[stt] start", {
    provider: provider.constructor?.name ?? "unknown",
    model,
    mimeType: ct,
    bytes: buffer.length,
    hasPrompt: Boolean(prompt),
    promptChars: prompt ? prompt.length : 0,
    expectedPreview: Array.isArray(context)
      ? String(context[0] ?? "").slice(0, 80)
      : String(context ?? "").slice(0, 80),
  });

  try {
    // PASS 1: probe
    const probe = await provider.probe({ buffer, mimeType: ct, model });

    console.log("[stt] probe", {
      hasSpeech: probe.hasSpeech,
      looksComprehensible: probe.looksComprehensible,
      chars: probe.text.length,
      preview: probe.text.slice(0, 120),
    });

    if (!probe.hasSpeech || !probe.looksComprehensible) {
      return "";
    }

    // If no expected-answer prompt, accept probe as final
    if (!prompt) {
      return probe.text;
    }

    // PASS 2: biased
    const biasedText = await provider.transcribe({
      buffer,
      mimeType: ct,
      model,
      language: "en",
      prompt,
    });

    console.log("[stt] ok", {
      chars: biasedText.length,
      preview: biasedText.slice(0, 120),
    });

    return biasedText;
  } catch (err) {
    // If it’s OpenAI, you’ll get nicer request_id/status via rethrowAsSttError
    if (provider.constructor?.name === "OpenAiSttProvider") {
      rethrowAsSttError(err);
    }

    console.error(
      "[stt] failed",
      safeJson({ message: (err as any)?.message, stack: (err as any)?.stack }),
    );
    throw err instanceof Error ? err : new Error("STT failed");
  }
}
