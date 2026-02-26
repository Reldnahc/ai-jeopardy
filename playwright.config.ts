import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/mockBackendServer.mjs",
      url: "http://127.0.0.1:3102/health",
      env: {
        ...process.env,
        MOCK_BACKEND_PORT: "3102",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx vite --host 0.0.0.0 --port 4173",
      url: "http://127.0.0.1:4173",
      env: {
        ...process.env,
        VITE_API_BASE: "http://127.0.0.1:3102",
        VITE_WS_URL: "ws://127.0.0.1:3102",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
