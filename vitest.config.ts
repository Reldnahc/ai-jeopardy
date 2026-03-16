import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "backend/**/*.test.ts",
      "shared/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
    globals: true,
  },
});
