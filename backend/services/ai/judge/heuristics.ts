import type { AnswerType } from "./types.js";

export function isTooGeneric(norm: string) {
    const bad = new Set([
        "it",
        "this",
        "that",
        "thing",
        "stuff",
        "someone",
        "somebody",
        "something",
        "anything",
        "everything",
        "idk",
        "i dont know",
        "dont know",
        "unknown",
    ]);

    if (bad.has(norm)) return true;
    if (norm.length <= 2) return true;
    return false;
}

function tokenSet(norm: string) {
    return new Set(norm.split(" ").filter(Boolean));
}

function tokenOverlap(a: Set<string>, b: Set<string>) {
    let hit = 0;
    for (const t of a) if (b.has(t)) hit++;
    return hit;
}

/**
 * Returns true if we can confidently short-circuit to "incorrect" due to zero overlap,
 * ONLY when expected answer is multi-token.
 */
export function shouldRejectForZeroOverlap(normExpected: string, normTranscript: string) {
    const aTokens = tokenSet(normExpected);
    const tTokens = tokenSet(normTranscript);

    if (aTokens.size >= 2) {
        const overlap = tokenOverlap(aTokens, tTokens);
        return overlap === 0;
    }
    return false;
}

export function inferAnswerType(expectedAnswer: string): AnswerType {
    const a = String(expectedAnswer || "").trim();

    if (/[0-9]/.test(a)) return "number";
    if (/^["“].+["”]$/.test(a) || /^(the|a|an)\s+/i.test(a)) return "title";

    if (/\b(mount|mt|river|lake|sea|ocean|city|state|country|island|bay|strait|peninsula)\b/i.test(a)) {
        return "place";
    }

    if (/^[A-Za-z]+(?:\s+[A-Za-z]+)+$/.test(a)) return "person";

    return "thing";
}
