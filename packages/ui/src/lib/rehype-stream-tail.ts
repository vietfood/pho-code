import { splitStreamingTokens } from "./smooth-stream";

// Wrap the last visible word after sanitize so Beautiful UI stream-in can
// target it without injecting unsanitized HTML. Code/math subtrees stay intact.

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  value?: string;
  children?: HastNode[];
};

export type StreamTailOptions = {
  caret?: boolean;
};

function classList(node: HastNode): string[] {
  const className = node.properties?.className;
  if (Array.isArray(className)) {
    return className.map(String);
  }
  if (typeof className === "string") {
    return className.split(/\s+/u);
  }
  return [];
}

function isSkippable(node: HastNode): boolean {
  if (node.tagName === "code" || node.tagName === "pre") {
    return true;
  }
  return classList(node).some(
    (name) => name === "katex" || name === "math" || name === "math-inline" || name === "math-display",
  );
}

function findLastStreamableText(node: HastNode): { parent: HastNode; index: number } | null {
  const children = node.children;
  if (!children || children.length === 0) {
    return null;
  }
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (!child) {
      continue;
    }
    if (child.type === "text") {
      if (!child.value || child.value.length === 0) {
        continue;
      }
      return { parent: node, index };
    }
    if (child.type === "element") {
      if (isSkippable(child)) {
        return null;
      }
      return findLastStreamableText(child);
    }
  }
  return null;
}

function caretNode(): HastNode {
  return {
    type: "element",
    tagName: "span",
    properties: {
      className: ["streaming-caret"],
      ariaHidden: true,
    },
    children: [],
  };
}

function tailNode(value: string): HastNode {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["streaming-word"] },
    children: [{ type: "text", value }],
  };
}

export function applyStreamTail(tree: HastNode, options: StreamTailOptions = {}): void {
  const found = findLastStreamableText(tree);
  if (!found || !found.parent.children) {
    if (options.caret) {
      tree.children = [...(tree.children ?? []), caretNode()];
    }
    return;
  }
  const node = found.parent.children[found.index];
  if (!node || node.type !== "text" || typeof node.value !== "string") {
    if (options.caret) {
      tree.children = [...(tree.children ?? []), caretNode()];
    }
    return;
  }
  const tokens = splitStreamingTokens(node.value);
  if (tokens.length === 0) {
    if (options.caret) {
      found.parent.children.splice(found.index + 1, 0, caretNode());
    }
    return;
  }
  const tail = tokens[tokens.length - 1] ?? "";
  const head = tokens.slice(0, -1).join("");
  const replacement: HastNode[] = head.length > 0 ? [{ type: "text", value: head }, tailNode(tail)] : [tailNode(tail)];
  if (options.caret) {
    replacement.push(caretNode());
  }
  found.parent.children.splice(found.index, 1, ...replacement);
}

export function rehypeStreamTail(options: StreamTailOptions = {}) {
  return (tree: unknown) => {
    applyStreamTail(tree as HastNode, options);
  };
}
