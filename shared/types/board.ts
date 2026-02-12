export type ClueMedia =
    | { type: "image"; assetId: string };

/** Represents a single clue/question on the board */
export type Clue = {
    value: number;
    question: string;
    answer: string;
    category?: string;
    showAnswer?: boolean;
    media?: ClueMedia;
};

/** Represents a single category with its title and associated clues/questions */
export interface Category {
    category: string; // Title of the category (e.g., "Science")
    values: Clue[];   // Array of clues/questions within the category
}

export type BoardData = {
    firstBoard: { categories: Category[] };
    secondBoard: { categories: Category[] };
    finalJeopardy: { categories: Category[] };
    // Optional narration precompute output. When present, the client can play audio instantly
    // without sending a WS "tts-ensure" for each clue.
    ttsAssetIds?: string[];
    ttsByClueKey?: Record<string, string>;
    ttsByAnswerKey?: Record<string, string>;

    dailyDoubleClueKeys?: {
        firstBoard: string[];   // usually length 1
        secondBoard: string[];  // usually length 2
    };
};