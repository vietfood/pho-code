import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /packaged\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  retries: 0,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
