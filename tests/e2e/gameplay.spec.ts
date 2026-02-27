import { expect, test } from "@playwright/test";

const MOCK_API = "http://127.0.0.1:3102";

async function resetMock(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post(`${MOCK_API}/test/reset`);
  expect(res.ok()).toBeTruthy();
}

async function signup(page: import("@playwright/test").Page, username: string) {
  await page.getByRole("button", { name: "Login / Signup" }).click();
  await page.getByPlaceholder("username").first().fill(username);
  await page.locator('input[type="password"]').first().fill("password123");
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page.getByRole("button", { name: "Login / Signup" })).not.toBeVisible();
}

test.describe("Gameplay E2E", () => {
  test("host and player can run a real clue flow", async ({ browser, page, request }) => {
    await resetMock(request);

    // Host setup
    await page.goto("/");
    await signup(page, "e2ehost");

    await page.getByRole("button", { name: "Create Game" }).click();
    await expect(page).toHaveURL(/\/lobby\/E2E01$/);

    // Player setup in a second browser context
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await playerPage.goto("/");
    await signup(playerPage, "e2eplayer");
    await playerPage.getByLabel("Game ID:").fill("E2E01");
    await playerPage.getByRole("button", { name: "Join Game" }).click();
    await expect(playerPage).toHaveURL(/\/lobby\/E2E01$/);

    // Host starts game, both should transition
    await page.getByRole("button", { name: "Start Game" }).click();
    await expect(page).toHaveURL(/\/game\/E2E01$/);
    await expect(playerPage).toHaveURL(/\/game\/E2E01$/);

    // First clue is active after game starts; both clients should see it
    await expect(page.getByText(/e2e clue question/i)).toBeVisible();
    await expect(playerPage.getByText(/e2e clue question/i)).toBeVisible();

    // Player buzzes; backend applies score + resolves clue for both clients
    await playerPage.getByRole("button", { name: "Buzz!" }).click();
    const stateRes = await request.get(`${MOCK_API}/test/state`);
    expect(stateRes.ok()).toBeTruthy();
    const stateJson = (await stateRes.json()) as { scores?: Record<string, number> };
    expect(stateJson.scores?.e2eplayer).toBe(200);

    await expect(page.getByText(/e2e clue question/i)).not.toBeVisible();
    await expect(playerPage.getByText(/e2e clue question/i)).not.toBeVisible();

    await playerContext.close();
  });
});
