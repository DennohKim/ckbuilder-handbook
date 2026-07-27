import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Every test spends real cells on a shared devnet, so they must not race
    // each other for the same inputs.
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
