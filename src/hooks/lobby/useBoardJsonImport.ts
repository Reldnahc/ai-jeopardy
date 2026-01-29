import { useCallback, useMemo, useState } from "react";

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function useBoardJsonImport() {
    const [boardJson, setBoardJson] = useState<string>("");
    const [boardJsonError, setBoardJsonError] = useState<string | null>(null);

    const validate = useCallback((raw: string): string | null => {
        if (!raw.trim()) return null; // empty means "use AI"

        try {
            const parsed: unknown = JSON.parse(raw);

            if (!isObject(parsed)) return "Board JSON must be an object.";

            // Accept either:
            // { firstBoard, secondBoard, finalJeopardy }
            // OR { boardData: { firstBoard, secondBoard, finalJeopardy } }
            const boardData = isObject((parsed as any).boardData) ? (parsed as any).boardData : parsed;

            if (
                !("firstBoard" in boardData) ||
                !("secondBoard" in boardData) ||
                !("finalJeopardy" in boardData)
            ) {
                return "Missing firstBoard / secondBoard / finalJeopardy.";
            }

            return null;
        } catch {
            return "Invalid JSON (can’t parse).";
        }
    }, []);

    const usingImportedBoard = useMemo(() => boardJson.trim().length > 0, [boardJson]);

    return {
        boardJson,
        setBoardJson,
        boardJsonError,
        setBoardJsonError,
        validate,
        usingImportedBoard,
    };
}
