import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildCategoryPoolMock, shuffleMock } = vi.hoisted(() => ({
  buildCategoryPoolMock: vi.fn(),
  shuffleMock: vi.fn(),
}));

vi.mock("./categoryPool.js", () => ({
  buildCategoryPool: buildCategoryPoolMock,
}));

vi.mock("./categoryUtils.js", async () => {
  const actual = await vi.importActual<typeof import("./categoryUtils.js")>("./categoryUtils.js");
  return {
    ...actual,
    shuffle: shuffleMock,
  };
});

import { getUniqueCategories } from "./getUniqueCategories.js";

describe("getUniqueCategories", () => {
  beforeEach(() => {
    buildCategoryPoolMock.mockReset();
    shuffleMock.mockReset();
  });

  it("returns unique categories excluding normalized matches", () => {
    buildCategoryPoolMock.mockReturnValue([
      "Pop-Culture",
      "Pop:Culture",
      "Science:Space",
      "Geography",
    ]);
    shuffleMock.mockImplementation((arr: string[]) => arr);

    const out = getUniqueCategories(2, { exclude: ["sciencespace"] });

    expect(buildCategoryPoolMock).toHaveBeenCalledWith(300);
    expect(out).toEqual(["Pop-Culture", "Geography"]);
  });

  it("throws when not enough unique categories exist", () => {
    buildCategoryPoolMock.mockReturnValue(["A", "a"]);
    shuffleMock.mockImplementation((arr: string[]) => arr);

    expect(() => getUniqueCategories(2)).toThrow("Unable to generate 2 unique categories");
  });
});
