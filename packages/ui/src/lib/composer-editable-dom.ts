import { formatSkillToken, type SkillSourceId, type WorkspaceReferenceKind } from "@pho-code/protocol";
import {
  formatAtMentionToken,
  inferMentionKind,
  mentionLabel,
  type MentionSkipRange,
} from "./at-mention";
import { parseComposerSegments } from "./composer-tokens";
import { githubLinkLabel } from "./github-link";

const FILE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mention-chip-icon" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';

const FOLDER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mention-chip-icon" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';

function wrapMentionChipShell(chip: HTMLSpanElement, documentRef: Document): HTMLSpanElement {
  const shell = documentRef.createElement("span");
  shell.className = "mention-chip-shell";
  shell.contentEditable = "false";
  shell.appendChild(chip);
  return shell;
}

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
  return wrapMentionChipShell(chip, documentRef);
}

const SKILL_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mention-chip-icon" aria-hidden="true"><path d="m15 4-8 16"/><path d="M7.5 4h9"/><path d="M7.5 20h9"/></svg>';

export function createSkillChipElement(
  sourceId: SkillSourceId,
  skillName: string,
  documentRef: Document = document,
): HTMLSpanElement {
  const chip = documentRef.createElement("span");
  chip.className = "mention-chip skill-chip";
  chip.contentEditable = "false";
  chip.dataset.skillSource = sourceId;
  chip.dataset.skillName = skillName;
  chip.title = skillName;
  chip.setAttribute("aria-label", formatSkillToken(sourceId, skillName));
  chip.innerHTML = `${SKILL_ICON_SVG}<span class="mention-chip-label"></span>`;
  const label = chip.querySelector(".mention-chip-label");
  if (label) {
    label.textContent = skillName;
  }
  return wrapMentionChipShell(chip, documentRef);
}

// Lucide Github icon paths (MIT).
const GITHUB_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mention-chip-icon" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>';

export function createGithubChipElement(
  url: string,
  owner: string,
  repo: string,
  documentRef: Document = document,
): HTMLSpanElement {
  const chip = documentRef.createElement("span");
  chip.className = "mention-chip github-chip";
  chip.contentEditable = "false";
  chip.dataset.githubUrl = url;
  chip.dataset.githubOwner = owner;
  chip.dataset.githubRepo = repo;
  chip.title = url;
  chip.setAttribute("aria-label", url);
  chip.innerHTML = `${GITHUB_ICON_SVG}<span class="mention-chip-label"></span>`;
  const label = chip.querySelector(".mention-chip-label");
  if (label) {
    label.textContent = githubLinkLabel(owner, repo);
  }
  return wrapMentionChipShell(chip, documentRef);
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
    const skillSource = el.dataset.skillSource;
    const skillName = el.dataset.skillName;
    if (skillSource && skillName) {
      out += formatSkillToken(skillSource as SkillSourceId, skillName);
      return;
    }
    const githubUrl = el.dataset.githubUrl;
    if (githubUrl !== undefined && githubUrl !== "") {
      out += githubUrl;
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
  const segments = parseComposerSegments(value, skip);
  for (const segment of segments) {
    switch (segment.type) {
      case "text":
        appendTextWithBreaks(fragment, segment.text, documentRef);
        break;
      case "skill":
        fragment.appendChild(createSkillChipElement(segment.sourceId, segment.skillName, documentRef));
        break;
      case "github":
        fragment.appendChild(
          createGithubChipElement(segment.url, segment.owner, segment.repo, documentRef),
        );
        break;
      case "mention": {
        const kind = kinds.get(segment.path) ?? inferMentionKind(segment.path);
        fragment.appendChild(createMentionChipElement(segment.path, kind, documentRef));
        break;
      }
      default: {
        const exhaustive: never = segment;
        return exhaustive;
      }
    }
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
    const skillSource = el.dataset.skillSource;
    const skillName = el.dataset.skillName;
    if (skillSource && skillName) {
      const token = formatSkillToken(skillSource as SkillSourceId, skillName);
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
    const githubUrl = el.dataset.githubUrl;
    if (githubUrl !== undefined && githubUrl !== "") {
      if (remaining <= githubUrl.length) {
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
      remaining -= githubUrl.length;
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
  const segments = parseComposerSegments(value, skip);
  const mentionCount = segments.filter((segment) => segment.type === "mention").length;
  const skillCount = segments.filter((segment) => segment.type === "skill").length;
  const githubCount = segments.filter((segment) => segment.type === "github").length;
  if (mentionCount === 0 && skillCount === 0 && githubCount === 0) {
    return false;
  }
  const mentionChips = root.querySelectorAll("[data-mention-path]").length;
  const skillChips = root.querySelectorAll("[data-skill-source]").length;
  const githubChips = root.querySelectorAll("[data-github-url]").length;
  return (
    mentionChips !== mentionCount || skillChips !== skillCount || githubChips !== githubCount
  );
}
