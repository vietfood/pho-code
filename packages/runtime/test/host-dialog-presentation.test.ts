import { describe, expect, test } from "bun:test";
import { splitHostDialogPresentation } from "../src/host-dialog-presentation";

describe("host dialog presentation", () => {
  test("splits a permission title and body at the first newline", () => {
    expect(splitHostDialogPresentation("Permission Required")).toEqual({ title: "Permission Required" });
    expect(splitHostDialogPresentation("Permission Required\nCurrent agent requested bash command 'git push'. Allow this command?")).toEqual({
      title: "Permission Required",
      message: "Current agent requested bash command 'git push'. Allow this command?",
    });
  });
});
