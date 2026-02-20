/** these are for the recent boards page and player history */
export type BoardValue = {
  value: number;
  answer: string;
  question: string;
};

export type Category = {
  category: string;
  values: BoardValue[];
};

type GameBoard = {
  categories: Category[];
};

type FinalJeopardy = {
  category: string;
  values: Array<{ answer: string; question: string }>;
};

export interface Board {
  host: string;
  model: string;
  firstBoard: GameBoard;
  secondBoard: GameBoard;
  finalJeopardy: {
    categories: FinalJeopardy[];
  };
}
