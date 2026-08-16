import { describe, expect, test } from "bun:test";
import {
  WINDOW_RELOAD_ACCELERATOR,
  applicationMenuViewItems,
  viewMenuClaimsPrimaryR,
} from "../../electron/application-menu-spec";

describe("application menu view accelerators", () => {
  test("moves window reload to Shift+R so primary R can toggle the right sidebar", () => {
    expect(WINDOW_RELOAD_ACCELERATOR).toBe("CommandOrControl+Shift+R");
    expect(applicationMenuViewItems()[0]).toEqual({
      kind: "reload",
      accelerator: WINDOW_RELOAD_ACCELERATOR,
      label: "Reload",
    });
    expect(viewMenuClaimsPrimaryR()).toBe(false);
  });
});
