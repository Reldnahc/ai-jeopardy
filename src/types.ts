export type ClueMedia =
    | { type: "image"; assetId: string };

/** Represents a single clue/question on the board */
export type Clue = {
    value: number;
    question: string;
    answer: string;
    showAnswer?: boolean;
    media?: ClueMedia;
};

/** Represents a single category with its title and associated clues/questions */
export interface Category {
    category: string; // Title of the category (e.g., "Science")
    values: Clue[];   // Array of clues/questions within the category
}

