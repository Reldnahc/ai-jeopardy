export function normalizeJeopardyText(s: unknown) {
    return String(s || "")
        .toLowerCase()
        .replace(/^\s*(what|who|where|when)\s+(is|are|was|were)\s+/i, "")
        .replace(/^\s*(it'?s|it is|they are|that'?s|that is)\s+/i, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function hasAnyAlphaNum(s: string) {
    return /[a-z0-9]/i.test(s);
}

export function clampLen(s: string, max = 400) {
    const v = String(s ?? "");
    if (v.length <= max) return v;
    return v.slice(0, max) + "…";
}
