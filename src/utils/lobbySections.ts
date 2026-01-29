export const CATEGORY_SECTIONS = [
    { key: "firstBoard", title: "Jeopardy!", count: 5 },
    { key: "secondBoard", title: "Double Jeopardy!", count: 5 },
    { key: "finalJeopardy", title: "Final Jeopardy!", count: 1 },
] as const;

export type CategorySection = (typeof CATEGORY_SECTIONS)[number];
export type BoardType = CategorySection["key"];

export function buildInitial<T>(make: (count: number) => T): Record<BoardType, T> {
    return CATEGORY_SECTIONS.reduce<Record<BoardType, T>>((acc, section) => {
        acc[section.key] = make(section.count);
        return acc;
    }, {} as Record<BoardType, T>);
}

export function flattenBySections(values: Record<BoardType, string[]>): string[] {
    return CATEGORY_SECTIONS.flatMap((s) => (values[s.key] ?? []).slice(0, s.count));
}

export function unflattenBySections(flat: string[]): Record<BoardType, string[]> {
    let cursor = 0;
    const out = {} as Record<BoardType, string[]>;
    for (const s of CATEGORY_SECTIONS) {
        out[s.key] = flat.slice(cursor, cursor + s.count);
        cursor += s.count;
    }
    return out;
}
