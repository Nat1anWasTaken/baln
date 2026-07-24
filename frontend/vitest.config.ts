import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/features/**/*.ts*",
        "src/pages/api-tokens-page.tsx",
      ],
      thresholds: {
        "src/pages/api-tokens-page.tsx": {
          statements: 70,
          branches: 80,
          functions: 70,
          lines: 70,
        },
      },
    },
  },
});
