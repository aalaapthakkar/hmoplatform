import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests that sign in and save data, against the real Supabase
 * project in .env.local. They use a dedicated test login (E2E_EMAIL and
 * E2E_PASSWORD in .env.local) and its own "E2E test organisation", so your
 * real organisation is never touched. Without those settings every test skips.
 *
 *   npm run test:e2e:live
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const port = 3218;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e/live",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      // The same tests at phone size, where the section menu becomes tabs.
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: `${baseURL}/favicon.ico`,
    timeout: 240_000,
    reuseExistingServer: false,
    // Auth emails must link back to this server, not the dev one.
    // The pretend e-sign provider, so tests never send real signature requests.
    env: { NEXT_PUBLIC_SITE_URL: baseURL, ESIGN_PROVIDER: "fake" },
  },
});
