import { describe, expect, test } from "bun:test";
import { hostDialogEnterResolution } from "../src/lib/host-dialog-keys";

describe("host dialog Enter resolution", () => {
  test("confirms the current select option", () => {
    expect(hostDialogEnterResolution("select", "Yes")).toEqual({ selected: "Yes" });
  });

  test("approves confirm dialogs", () => {
    expect(hostDialogEnterResolution("confirm", "")).toEqual({ confirmed: true });
  });

  test("leaves input dialogs to form submit", () => {
    expect(hostDialogEnterResolution("input", "")).toBeNull();
  });

  test("does not confirm an empty select", () => {
    expect(hostDialogEnterResolution("select", "")).toBeNull();
  });
});
