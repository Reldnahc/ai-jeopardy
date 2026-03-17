function cleanJsonText(s: unknown) {
  return String(s ?? "")
    .replace(/```(?:json)?/g, "")
    .trim();
}

export function parseAiJson<T = unknown>(response: unknown): T {
  const openAiRoot = response as { choices?: Array<{ message?: { content?: unknown } }> };
  const openAiContent = openAiRoot?.choices?.[0]?.message?.content;
  if (typeof openAiContent === "string" && openAiContent.trim()) {
    return JSON.parse(cleanJsonText(openAiContent)) as T;
  }

  const anthropicRoot = response as { content?: Array<{ type?: string; text?: unknown }> };
  const anthropicText = anthropicRoot?.content?.find((item) => item?.type === "text")?.text;
  if (typeof anthropicText === "string" && anthropicText.trim()) {
    return JSON.parse(cleanJsonText(anthropicText)) as T;
  }

  const geminiRoot = response as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  const geminiText = geminiRoot?.candidates?.[0]?.content?.parts?.find(
    (item) => typeof item?.text === "string" && String(item.text).trim(),
  )?.text;
  if (typeof geminiText === "string" && geminiText.trim()) {
    return JSON.parse(cleanJsonText(geminiText)) as T;
  }

  throw new Error("AI response missing JSON text content.");
}
