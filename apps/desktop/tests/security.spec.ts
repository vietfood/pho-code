import { expect, test } from "@playwright/test";
import { launchDesktop, makeAgentDir, makeUserDataDir, removeTestDirectory } from "./helpers/electron-app";

test("enforces production CSP, navigation denial, and permission denial", async () => {
  const userDataDir = await makeUserDataDir();
  const agentDir = await makeAgentDir();
  const harness = await launchDesktop(userDataDir, {
    env: { PHO_CODE_AGENT_DIR: agentDir },
  });

  try {
    const page = await harness.firstWindow();
    await expect(page.getByTestId("bootstrap-state")).toBeVisible();
    const originalUrl = page.url();

    const [response] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url() === originalUrl || candidate.url().includes("index.html")),
      page.reload(),
    ]);
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");

    await page.evaluate(() => {
      window.location.assign("file:///etc/passwd");
    });
    await expect.poll(() => page.url()).toBe(originalUrl);

    const popupDenied = await page.evaluate(() => window.open("file:///etc/passwd", "_blank") === null);
    expect(popupDenied).toBe(true);
    expect(harness.electronApp.windows()).toHaveLength(1);

    const permission = await page.evaluate(async () => Notification.requestPermission());
    expect(permission).toBe("denied");

    const subscription = await page.evaluate(() => {
      const bridge = window.phoCode;
      if (!bridge) {
        throw new Error("Desktop bridge is missing.");
      }
      let calls = 0;
      const stop = bridge.subscribe(() => {
        calls += 1;
      });
      stop();
      stop();
      return { stopType: typeof stop, calls };
    });
    expect(subscription.stopType).toBe("function");
    expect(subscription.calls).toBe(0);
  } finally {
    await harness.close();
    await removeTestDirectory(userDataDir);
    await removeTestDirectory(agentDir);
  }
});
