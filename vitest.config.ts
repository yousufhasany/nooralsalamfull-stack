import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/server", replacement: path.resolve(__dirname, "backend/src/server") },
      { find: "@/lib", replacement: path.resolve(__dirname, "backend/src/lib") },
      { find: "@/generated", replacement: path.resolve(__dirname, "backend/src/generated") },
      { find: "@/integrations", replacement: path.resolve(__dirname, "backend/src/integrations") },
      { find: "@/components", replacement: path.resolve(__dirname, "frontend/src/components") },
      { find: "@/i18n", replacement: path.resolve(__dirname, "frontend/src/i18n") },
      { find: "@/app", replacement: path.resolve(__dirname, "frontend/src/app") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: "forks",
  },
});
