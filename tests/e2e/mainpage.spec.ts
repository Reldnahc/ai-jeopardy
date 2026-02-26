import { expect, test } from "@playwright/test";

test.describe("Main Page", () => {
  test("renders primary game actions", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Create Game" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join Game" })).toBeVisible();
    await expect(page.getByLabel("Game ID:")).toBeVisible();
  });

  test("navigates to discovery pages from home", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /Rank\s+Leaderboards/i }).click();
    await expect(page).toHaveURL(/\/leaderboards$/);
    await expect(page.getByText(/Ranked by/i)).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: /Explore\s+Recent Boards/i }).click();
    await expect(page).toHaveURL(/\/recent-boards$/);
    await expect(page.getByText(/Explore generated boards/i)).toBeVisible();
  });
});
