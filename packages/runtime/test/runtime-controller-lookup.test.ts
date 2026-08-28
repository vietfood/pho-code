import { describe, expect, test } from "bun:test";
import { HARNESS_ERROR_CODES, sessionKeyId, type SessionKey } from "@pho-code/protocol";
import { createControllerLookup, type LocatableController } from "../src/runtime-controller-lookup";
import { createProjectTrust } from "../src/project-trust";

function controller(workspaceId: string, sessionId: string): LocatableController {
  return { key: { workspaceId, sessionId } };
}

function lookupOver(list: LocatableController[], selected?: LocatableController) {
  const byKey = new Map(list.map((entry) => [sessionKeyId(entry.key), entry]));
  return createControllerLookup<LocatableController>({
    get: (key: SessionKey) => byKey.get(sessionKeyId(key)),
    list: () => list,
    selected: () => selected,
  });
}

describe("controller lookup", () => {
  test("matches the exact controller when the command names a workspace", () => {
    const target = controller("/tmp/a", "s1");
    const lookup = lookupOver([target, controller("/tmp/b", "s1")]);

    expect(lookup.locate("s1", "/tmp/a", "sendPrompt")).toBe(target);
  });

  test("refuses with 'not open' when the named workspace has no such controller", () => {
    const lookup = lookupOver([controller("/tmp/a", "s1")]);

    expect(() => lookup.locate("s1", "/tmp/b", "sendPrompt")).toThrow(
      expect.objectContaining({ code: HARNESS_ERROR_CODES.sessionNotFound, message: "The target session is not open." }),
    );
  });

  test("resolves an unambiguous resident match when no workspace is named", () => {
    const target = controller("/tmp/a", "s1");
    const lookup = lookupOver([target, controller("/tmp/b", "s2")]);

    expect(lookup.locate("s1", undefined, "sendPrompt")).toBe(target);
  });

  test("prefers the current selection when the same session id is open twice", () => {
    const first = controller("/tmp/a", "s1");
    const second = controller("/tmp/b", "s1");
    const lookup = lookupOver([first, second], second);

    expect(lookup.locate("s1", undefined, "sendPrompt")).toBe(second);
    expect(lookup.locate("s1", "", "sendPrompt")).toBe(second);
  });

  test("refuses an ambiguous session id that is not the selection", () => {
    const lookup = lookupOver([controller("/tmp/a", "s1"), controller("/tmp/b", "s1")], controller("/tmp/c", "s9"));

    expect(() => lookup.locate("s1", undefined, "sendPrompt")).toThrow(
      expect.objectContaining({
        code: HARNESS_ERROR_CODES.sessionNotFound,
        message: "The target session is not the active session.",
      }),
    );
  });
});

describe("project trust", () => {
  test("approves a workspace for this process without writing the store", () => {
    const writes: string[] = [];
    const trust = createProjectTrust({
      store: { get: () => (writes.length > 0 ? true : undefined) },
      requiresTrust: () => true,
    });

    expect(trust.isApproved("/tmp/ws")).toBe(false);
    trust.approveForSession("/tmp/ws");
    expect(trust.isApproved("/tmp/ws")).toBe(true);
    expect(writes).toHaveLength(0);
  });

  test("treats a workspace that needs no trust as approved", () => {
    const trust = createProjectTrust({ store: { get: () => undefined }, requiresTrust: () => false });
    expect(trust.isApproved("/tmp/ws")).toBe(true);
  });

  test("honours a stored decision, and treats an undecided null as not approved", () => {
    const decisions: Record<string, boolean | null> = { "/tmp/yes": true, "/tmp/no": false, "/tmp/unset": null };
    const trust = createProjectTrust({
      store: { get: (cwd) => decisions[cwd] },
      requiresTrust: () => true,
    });

    expect(trust.isApproved("/tmp/yes")).toBe(true);
    expect(trust.isApproved("/tmp/no")).toBe(false);
    expect(trust.isApproved("/tmp/unset")).toBe(false);
    expect(trust.isApproved("/tmp/missing")).toBe(false);
  });
});
