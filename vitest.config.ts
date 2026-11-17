import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/api/**/*.test.ts", "apps/worker/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
