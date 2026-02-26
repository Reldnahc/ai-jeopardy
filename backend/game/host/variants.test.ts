import { describe, expect, it } from "vitest";
import { collectBoardValues, nameCalloutText } from "./variants.js";

describe("host variants", () => {
  it("formats name callouts", () => {
    expect(nameCalloutText("Alice")).toBe("Alice!");
  });

  it("collects unique positive board values across both boards", () => {
    const game = {
      boardData: {
        firstBoard: {
          categories: [{ values: [{ value: "200" }, { value: 400 }, { value: -100 }, { value: "x" }] }],
        },
        secondBoard: {
          categories: [{ values: [{ value: 400 }, { value: 800 }, { value: null }] }],
        },
      },
    };

    expect(collectBoardValues(game as never)).toEqual([200, 400, 800]);
  });

  it("returns empty list when board data is missing", () => {
    expect(collectBoardValues({} as never)).toEqual([]);
  });

  it("handles categories with missing value arrays", () => {
    const game = {
      boardData: {
        firstBoard: { categories: [undefined, { values: undefined }] },
        secondBoard: { categories: [] },
      },
    };

    expect(collectBoardValues(game as never)).toEqual([]);
  });
});
