// backend/stt/prompt.ts
export function buildExpectedAnswerPrompt(context: unknown): string | undefined {
    // Accept:
    // - "Mount Rushmore"
    // - ["Mount Rushmore"] (legacy)
    let expected: string;

    if (Array.isArray(context)) expected = String(context[0] ?? "").trim();
    else expected = String(context ?? "").trim();

    if (!expected) return undefined;

    return (
        "Transcribe speech verbatim.\n" +
        "If you do not clearly hear any speech, return an empty string.\n" +
        "Expected answer hint (may or may not be spoken):\n" +
        expected +
        "\n" +
        "Return only the transcript."
    );
}

export function looksComprehensible(text: unknown): boolean {
    const t = String(text || "").trim();
    if (!t) return false;

    const noSpace = t.replace(/\s+/g, "");
    if (noSpace.length < 2) return false;

    // Unicode property escapes (Node 16+)
    const alphaNum = (t.match(/[\p{L}\p{N}]/gu) || []).length;
    if (alphaNum === 0) return false;

    const ratio = alphaNum / Math.max(1, noSpace.length);

    if (alphaNum >= 2) return true;
    return ratio >= 0.2;
}
