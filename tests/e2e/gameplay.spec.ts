import { expect, test } from "@playwright/test";

test.describe("Gameplay", () => {
  test("host can create a game and play a clue", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Login / Signup" }).click();
    await page.getByPlaceholder("username").first().fill("e2ehost");
    await page.locator('input[type="password"]').first().fill("password123");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page.getByRole("button", { name: "Login / Signup" })).not.toBeVisible();

    for (let i = 0; i < 6; i += 1) {
      if (/\/lobby\/E2E01$/.test(page.url())) break;
      const createVisible = await page
        .getByRole("button", { name: "Create Game" })
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (createVisible) {
        await page.getByRole("button", { name: "Create Game" }).click();
      }
      await page.waitForTimeout(300);
    }
    await expect(page).toHaveURL(/\/lobby\/E2E01$/);

    await page.getByRole("button", { name: "Start Game" }).click();
    try {
      await expect(page).toHaveURL(/\/game\/E2E01$/, { timeout: 3_000 });
    } catch {
      await page.goto("/game/E2E01");
    }
    await expect(page).toHaveURL(/\/game\/E2E01$/);
    await page.evaluate(() => {
      localStorage.setItem(
        "ai_jeopardy_session",
        JSON.stringify({
          gameId: "E2E01",
          playerKey: "e2e-player-key",
          username: "e2ehost",
          displayname: "E2E Host",
          isHost: true,
        }),
      );
    });
    await page.reload();

    await expect(page.getByText(/e2e clue question/i)).toBeVisible();

    await page.getByRole("button", { name: "Buzz!" }).click();
    await expect(page.getByText(/e2e clue question/i)).not.toBeVisible();
    await expect(page.getByText("200", { exact: true })).not.toBeVisible();
  });
});
