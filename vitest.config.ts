import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "evals/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
    globalSetup: ["./vitest.global-setup.ts"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 20_000,
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
