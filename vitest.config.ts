import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "zerithdb-core": resolve(__dirname, "packages/core/src/index.ts"),
      "zerithdb-db": resolve(__dirname, "packages/db/src/index.ts"),
      "zerithdb-auth": resolve(__dirname, "packages/auth/src/index.ts"),
      "zerithdb-sdk": resolve(__dirname, "packages/sdk/src/index.ts"),
      "zerithdb-sync": resolve(__dirname, "packages/sync/src/index.ts"),
      "zerithdb-network": resolve(__dirname, "packages/network/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["node_modules/**", "dist/**", "**/*.d.ts", "**/*.config.*", "**/index.ts"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
    include: ["packages/*/src/**/*.test.ts", "infra/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".next"],
  },
});
