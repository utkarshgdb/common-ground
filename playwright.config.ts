import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const external = process.env.E2E_BASE_URL; // set to the Vercel URL for the production smoke test

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: external ?? `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
        // No Supabase and no Gemini key: local JSON store + rules fallback (acceptance test 7).
        env: { CG_DATA_DIR: path.join(process.cwd(), ".data", "e2e"), GEMINI_API_KEY: "", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
      },
});
