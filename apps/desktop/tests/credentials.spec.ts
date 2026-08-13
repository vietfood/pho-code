import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchDesktop, makeUserDataDir, removeTestDirectory } from "./helpers/electron-app";

test("imports a provider API key without exposing it to the renderer", async () => {
  const userDataDir = await makeUserDataDir();
  const secret = "sk-pho-code-test-import-9f3c";

  try {
    const harness = await launchDesktop(userDataDir, {
      env: {
        PHO_CODE_TEST_MODEL: "1",
      },
    });
    try {
      const page = await harness.firstWindow();
      await page.getByTestId("open-settings").click();
      await expect(page.getByTestId("credential-settings")).toBeVisible();
      await expect(page.getByTestId("no-configured-providers")).toBeVisible();
      await page.getByTestId("credential-provider").selectOption("deepseek");
      await page.getByTestId("credential-api-key").fill(secret);
      await page.getByTestId("credential-import").click();
      await expect(page.getByTestId("configured-providers")).toContainText("configured");
      await expect(page.getByTestId("credential-api-key")).toHaveValue("");
      expect(await page.content()).not.toContain(secret);
    } finally {
      await harness.close();
    }

    const auth = JSON.parse(await readFile(join(userDataDir, "pi-agent", "auth.json"), "utf8")) as {
      deepseek?: { type?: string; key?: string };
    };
    expect(auth.deepseek?.type).toBe("api_key");
    expect(auth.deepseek?.key).toBe(secret);
  } finally {
    await removeTestDirectory(userDataDir);
  }
});
