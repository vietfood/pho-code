import { describe, expect, test } from "bun:test";
import {
  findAtQuery,
  inferMentionKind,
  insertAtMention,
  mentionDirectory,
  mentionLabel,
} from "../src/lib/at-mention";

describe("composer @ mentions", () => {
  test("finds an @ query at the start or after whitespace", () => {
    expect(findAtQuery("@src", 4)).toEqual({ start: 0, query: "src", raw: "src" });
    expect(findAtQuery("see @pack", 9)).toEqual({ start: 4, query: "pack", raw: "pack" });
    expect(findAtQuery("email a@b.com", 13)).toBeNull();
  });

  test("keeps an active mention open across spaces until the caret leaves it", () => {
    expect(findAtQuery("@KL divergence.md", 17)).toBeNull();
    expect(findAtQuery("@KL divergence.md", 17, 0)).toEqual({
      start: 0,
      query: "KL divergence.md",
      raw: "KL divergence.md",
    });
    expect(findAtQuery("see @KL divergence", 18, 4)).toEqual({
      start: 4,
      query: "KL divergence",
      raw: "KL divergence",
    });
    expect(findAtQuery("@KL divergence.md", 0, 0)).toBeNull();
  });

  test("keeps an in-progress quoted mention open", () => {
    expect(findAtQuery('@"KL divergence', 15)).toEqual({
      start: 0,
      query: "KL divergence",
      raw: '"KL divergence',
    });
  });

  test("inserts the chosen path inline and quotes whitespace", () => {
    expect(insertAtMention("read @pack", { start: 5, query: "pack", raw: "pack" }, 10, "src/pack.ts")).toEqual({
      text: "read @src/pack.ts ",
      cursor: 18,
    });
    expect(
      insertAtMention("read @pack more", { start: 5, query: "pack", raw: "pack" }, 10, "src/pack.ts"),
    ).toEqual({
      text: "read @src/pack.ts more",
      cursor: 17,
    });
    expect(
      insertAtMention(
        "@KL divergence",
        { start: 0, query: "KL divergence", raw: "KL divergence" },
        14,
        "notes/KL divergence.md",
      ),
    ).toEqual({
      text: '@"notes/KL divergence.md" ',
      cursor: 26,
    });
  });

  test("mentionLabel uses the basename and inferMentionKind uses trailing slash", () => {
    expect(mentionLabel("AGENTS.md")).toBe("AGENTS.md");
    expect(mentionLabel("packages/ui/src/composer.tsx")).toBe("composer.tsx");
    expect(mentionLabel("notes/KL divergence.md")).toBe("KL divergence.md");
    expect(mentionLabel("src/lib/")).toBe("lib");
    expect(mentionDirectory("notes/KL divergence.md")).toBe("notes");
    expect(mentionDirectory("AGENTS.md")).toBeNull();
    expect(inferMentionKind("AGENTS.md")).toBe("file");
    expect(inferMentionKind("src/")).toBe("folder");
  });
});
