import { defineConfig, devices } from "@playwright/test";

const port = 3217;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // Signed-in tests against real Supabase: npm run test:e2e:live.
  testIgnore: "live/**",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    // A static file the proxy skips, so readiness never depends on auth redirects.
    url: `${baseURL}/favicon.ico`,
    timeout: 240_000,
    reuseExistingServer: false,
    // Dummy values: e2e tests never talk to a real Supabase project.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-dummy-key",
      NEXT_PUBLIC_SITE_URL: baseURL,
      EMAIL_PROVIDER: "fake",
    },
  },
});
