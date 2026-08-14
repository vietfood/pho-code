import { describe, expect, test } from "bun:test";
import { documentBodyPortalTarget } from "../src/lib/document-body-portal";

describe("documentBodyPortalTarget", () => {
  test("returns null in the unit-test host without a document", () => {
    expect(documentBodyPortalTarget()).toBeNull();
  });

  test("returns document.body when a document exists", () => {
    const body = {} as HTMLElement;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { body },
    });
    try {
      expect(documentBodyPortalTarget()).toBe(body);
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  });
});
