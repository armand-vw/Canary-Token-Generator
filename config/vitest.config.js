import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["docs/js/**/*.js"],
      exclude: ["docs/js/app.js", "docs/js/templates.js"]
    }
  }
});
