import { describe, expect, test } from "bun:test";
import { isPrimaryModShortcut } from "../src/lib/shell-shortcut";

function chord(
  key: string,
  modifiers: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {},
): Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> {
  return {
    key,
    metaKey: modifiers.meta === true,
    ctrlKey: modifiers.ctrl === true,
    altKey: modifiers.alt === true,
    shiftKey: modifiers.shift === true,
  };
}

describe("isPrimaryModShortcut", () => {
  test("matches Command/Control plus the key and ignores the other platform modifier", () => {
    expect(isPrimaryModShortcut(chord("b", { meta: true }), "b")).toBe(true);
    expect(isPrimaryModShortcut(chord("B", { ctrl: true }), "b")).toBe(true);
    expect(isPrimaryModShortcut(chord("r", { meta: true }), "r")).toBe(true);
    expect(isPrimaryModShortcut(chord("r", { ctrl: true }), "r")).toBe(true);
  });

  test("rejects Shift, Alt, and unbound keys so reload can stay on Shift+R", () => {
    expect(isPrimaryModShortcut(chord("r", { meta: true, shift: true }), "r")).toBe(false);
    expect(isPrimaryModShortcut(chord("r", { meta: true, alt: true }), "r")).toBe(false);
    expect(isPrimaryModShortcut(chord("r"), "r")).toBe(false);
    expect(isPrimaryModShortcut(chord("b", { meta: true }), "r")).toBe(false);
    expect(isPrimaryModShortcut(chord("r", { meta: true, shift: true }), "r", { shift: true })).toBe(true);
  });
});
