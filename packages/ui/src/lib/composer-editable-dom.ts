import type { WorkspaceReferenceKind } from "@pho-code/protocol";
import {
  formatAtMentionToken,
  inferMentionKind,
  mentionLabel,
  parseMentionSegments,
  type MentionSkipRange,
} from "./at-mention";

const FILE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mention-chip-icon" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';

const FOLDER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mention-chip-icon" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';

export function createMentionChipElement(
  path: string,
  kind: WorkspaceReferenceKind,
  documentRef: Document = document,
): HTMLSpanElement {
  const chip = documentRef.createElement("span");
  chip.className = "mention-chip";
  chip.contentEditable = "false";
  chip.dataset.mentionPath = path;
  chip.dataset.mentionKind = kind;
  chip.title = path;
  chip.setAttribute("aria-label", path);
  chip.innerHTML = `${kind === "folder" ? FOLDER_ICON_SVG : FILE_ICON_SVG}<span class="mention-chip-label"></span>`;
  const label = chip.querySelector(".mention-chip-label");
  if (label) {
    label.textContent = mentionLabel(path);
  }
  return chip;
}

export function serializeComposerEditable(root: HTMLElement): string {
  let out = "";

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const el = node as HTMLElement;
    const mentionPath = el.dataset.mentionPath;
    if (mentionPath !== undefined && mentionPath !== "") {
      out += formatAtMentionToken(mentionPath);
      return;
    }
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    if (el.tagName === "DIV" || el.tagName === "P") {
      if (out.length > 0 && !out.endsWith("\n")) {
        out += "\n";
      }
    }
    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }
  };

  for (const child of Array.from(root.childNodes)) {
    walk(child);
  }
  return out;
}

export function renderComposerValue(
  root: HTMLElement,
  value: string,
  kinds: ReadonlyMap<string, WorkspaceReferenceKind> = new Map(),
  documentRef: Document = document,
  skip?: MentionSkipRange,
): void {
  if (value === "") {
    root.replaceChildren();
    return;
  }

  const fragment = documentRef.createDocumentFragment();
  const segments = parseMentionSegments(value, skip);
  for (const segment of segments) {
    if (segment.type === "text") {
      appendTextWithBreaks(fragment, segment.text, documentRef);
      continue;
    }
    const kind = kinds.get(segment.path) ?? inferMentionKind(segment.path);
    fragment.appendChild(createMentionChipElement(segment.path, kind, documentRef));
  }
  root.replaceChildren(fragment);
}

function appendTextWithBreaks(parent: ParentNode, text: string, documentRef: Document): void {
  const parts = text.split("\n");
  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0) {
      parent.appendChild(documentRef.createElement("br"));
    }
    const part = parts[index] ?? "";
    if (part !== "") {
      parent.appendChild(documentRef.createTextNode(part));
    }
  }
}

export function normalizePastedPlainText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function insertComposerPlainText(
  value: string,
  selection: { start: number; end: number },
  pasted: string,
): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(selection.start, selection.end, value.length));
  const end = Math.max(start, Math.min(Math.max(selection.start, selection.end), value.length));
  return {
    text: `${value.slice(0, start)}${pasted}${value.slice(end)}`,
    cursor: start + pasted.length,
  };
}

export function getComposerSelectionOffsets(root: HTMLElement): { start: number; end: number } {
  const selection = root.ownerDocument.defaultView?.getSelection();
  const length = serializeComposerEditable(root).length;
  if (!selection || selection.rangeCount === 0) {
    return { start: length, end: length };
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return { start: length, end: length };
  }
  const start = offsetFromRangeEnd(root, range.startContainer, range.startOffset);
  const end = offsetFromRangeEnd(root, range.endContainer, range.endOffset);
  return start <= end ? { start, end } : { start: end, end: start };
}

function offsetFromRangeEnd(root: HTMLElement, node: Node, nodeOffset: number): number {
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(root);
  try {
    prefix.setEnd(node, nodeOffset);
  } catch {
    return serializeComposerEditable(root).length;
  }
  return serializeRange(prefix);
}

export function scrollComposerCaretIntoView(root: HTMLElement): void {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
    root.scrollTop = root.scrollHeight;
    return;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const box = root.getBoundingClientRect();
  if (rect.bottom === 0 && rect.top === 0) {
    root.scrollTop = root.scrollHeight;
    return;
  }
  if (rect.bottom > box.bottom) {
    root.scrollTop += rect.bottom - box.bottom + 6;
  } else if (rect.top < box.top) {
    root.scrollTop -= box.top - rect.top + 6;
  }
}

export function getComposerCaretOffset(root: HTMLElement): number {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return serializeComposerEditable(root).length;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return serializeComposerEditable(root).length;
  }
  const prefix = range.cloneRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  return serializeRange(prefix);
}

export function setComposerCaretOffset(root: HTMLElement, offset: number): void {
  const point = locateOffset(root, Math.max(0, offset));
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection || !point) {
    return;
  }
  const range = root.ownerDocument.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function serializeRange(range: Range): number {
  const fragment = range.cloneContents();
  const holder = range.startContainer.ownerDocument?.createElement("div");
  if (!holder) {
    return 0;
  }
  holder.appendChild(fragment);
  return serializeComposerEditable(holder).length;
}

function locateOffset(
  root: HTMLElement,
  target: number,
): { node: Node; offset: number } | null {
  let remaining = target;

  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (remaining <= text.length) {
        return { node, offset: remaining };
      }
      remaining -= text.length;
      return null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const el = node as HTMLElement;
    const mentionPath = el.dataset.mentionPath;
    if (mentionPath !== undefined && mentionPath !== "") {
      const token = formatAtMentionToken(mentionPath);
      if (remaining <= token.length) {
        const parent = el.parentNode;
        if (!parent) {
          return { node: root, offset: 0 };
        }
        const index = Array.from(parent.childNodes).indexOf(el);
        if (remaining === 0) {
          return { node: parent, offset: index };
        }
        return { node: parent, offset: index + 1 };
      }
      remaining -= token.length;
      return null;
    }
    if (el.tagName === "BR") {
      if (remaining <= 1) {
        const parent = el.parentNode;
        if (!parent) {
          return { node: root, offset: 0 };
        }
        const index = Array.from(parent.childNodes).indexOf(el);
        return remaining === 0
          ? { node: parent, offset: index }
          : { node: parent, offset: index + 1 };
      }
      remaining -= 1;
      return null;
    }
    for (const child of Array.from(el.childNodes)) {
      const found = visit(child);
      if (found) {
        return found;
      }
    }
    return null;
  };

  for (const child of Array.from(root.childNodes)) {
    const found = visit(child);
    if (found) {
      return found;
    }
  }

  return { node: root, offset: root.childNodes.length };
}

export function composerNeedsChipRender(
  root: HTMLElement,
  value: string,
  skip?: MentionSkipRange,
): boolean {
  const segments = parseMentionSegments(value, skip);
  const mentionCount = segments.filter((segment) => segment.type === "mention").length;
  if (mentionCount === 0) {
    return false;
  }
  const chipCount = root.querySelectorAll("[data-mention-path]").length;
  return chipCount !== mentionCount;
}
