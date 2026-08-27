import { describe, expect, test } from "bun:test";
import {
  closeChatTab,
  emptyChatTabs,
  focusChatTab,
  isChatTabOpen,
  openChatTab,
  readChatTabs,
  replaceChatTabKey,
  writeChatTabs,
  type ChatTabs,
} from "../src/lib/chat-tabs";

const A = "pi:ws-1:sess-a";
const B = "pi:ws-1:sess-b";
const C = "pi:ws-2:sess-c";

function tabs(partial: Partial<ChatTabs>): ChatTabs {
  return { ...emptyChatTabs(), ...partial };
}

describe("openChatTab", () => {
  test("appends and activates each new tab", () => {
    let state = emptyChatTabs();
    state = openChatTab(state, A);
    expect(state).toEqual({ tabs: [A], active: A });
    state = openChatTab(state, B);
    expect(state).toEqual({ tabs: [A, B], active: B });
    state = openChatTab(state, C);
    expect(state).toEqual({ tabs: [A, B, C], active: C });
  });

  test("re-opening a known tab only activates it", () => {
    const state = tabs({ tabs: [A, B, C], active: C });
    const next = openChatTab(state, A);
    expect(next.tabs).toEqual([A, B, C]);
    expect(next.active).toBe(A);
  });
});

describe("focusChatTab", () => {
  test("activates an open tab and ignores unknown or already-active tabs", () => {
    const state = tabs({ tabs: [A, B], active: A });
    expect(focusChatTab(state, B).active).toBe(B);
    expect(focusChatTab(state, A)).toBe(state);
    expect(focusChatTab(state, C)).toBe(state);
  });
});

describe("closeChatTab", () => {
  test("closing the active tab activates its right neighbor", () => {
    const state = tabs({ tabs: [A, B, C], active: A });
    expect(closeChatTab(state, A)).toEqual({ tabs: [B, C], active: B });
  });

  test("closing the last tab activates its left neighbor", () => {
    const state = tabs({ tabs: [A, B, C], active: C });
    expect(closeChatTab(state, C)).toEqual({ tabs: [A, B], active: B });
  });

  test("closing an inactive tab keeps the active tab", () => {
    const state = tabs({ tabs: [A, B, C], active: B });
    expect(closeChatTab(state, C)).toEqual({ tabs: [A, B], active: B });
  });

  test("closing the only tab empties the strip", () => {
    const state = tabs({ tabs: [A], active: A });
    expect(closeChatTab(state, A)).toEqual({ tabs: [], active: null });
  });

  test("closing an unknown tab is a no-op", () => {
    const state = tabs({ tabs: [A], active: A });
    expect(closeChatTab(state, C)).toBe(state);
  });
});

describe("isChatTabOpen", () => {
  test("reports open tabs", () => {
    const state = tabs({ tabs: [A, B], active: A });
    expect(isChatTabOpen(state, A)).toBe(true);
    expect(isChatTabOpen(state, B)).toBe(true);
    expect(isChatTabOpen(state, C)).toBe(false);
  });
});

describe("replaceChatTabKey", () => {
  test("gives a pending tab its real session key everywhere", () => {
    const state = tabs({ tabs: [A, "pending:1"], active: "pending:1" });
    const next = replaceChatTabKey(state, "pending:1", B);
    expect(next.tabs).toEqual([A, B]);
    expect(next.active).toBe(B);
  });

  test("is a no-op when the old key is not open or the new key already is", () => {
    const state = tabs({ tabs: [A, B], active: A });
    expect(replaceChatTabKey(state, "pending:1", C)).toEqual(state);
    expect(replaceChatTabKey(state, A, B)).toEqual(state);
  });
});

describe("chat tabs storage", () => {
  function withStubbedLocalStorage(run: () => void): void {
    const original = globalThis.localStorage;
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    try {
      run();
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
    }
  }

  test("defaults to empty and round-trips", () => {
    withStubbedLocalStorage(() => {
      expect(readChatTabs()).toEqual({ tabs: [], active: null });
      const state = tabs({ tabs: [A, B], active: B });
      writeChatTabs(state);
      expect(readChatTabs()).toEqual(state);
    });
  });

  test("drops unknown sessions and repairs the active tab on read", () => {
    withStubbedLocalStorage(() => {
      writeChatTabs(tabs({ tabs: [A, B, C], active: C }));
      const known = new Set([A, B]);
      expect(readChatTabs((key) => known.has(key))).toEqual({ tabs: [A, B], active: A });
    });
  });

  test("corrupt JSON falls back to empty", () => {
    withStubbedLocalStorage(() => {
      globalThis.localStorage.setItem("pho-code.chatTabs", "{not json");
      expect(readChatTabs()).toEqual({ tabs: [], active: null });
    });
  });

  test("migrates the legacy tiling layout into a tab strip", () => {
    withStubbedLocalStorage(() => {
      globalThis.localStorage.setItem(
        "pho-code.chatTiles",
        JSON.stringify({ visible: [A, B], minimized: [C], recency: [B, A], focused: B, splitRatio: 0.5 }),
      );
      expect(readChatTabs()).toEqual({ tabs: [A, B, C], active: B });
    });
  });
});
