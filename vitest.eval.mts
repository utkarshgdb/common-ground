import { defineConfig } from "vitest/config";

// Live Gemini eval for P1-2 (needs GEMINI_API_KEY). Run: npx vitest run --config vitest.eval.mts
export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname, "server-only": import.meta.dirname + "/tests/unit/stubs/server-only.ts" } },
  test: { include: ["tests/eval/**/*.eval.ts"], environment: "node", testTimeout: 600_000 },
});
