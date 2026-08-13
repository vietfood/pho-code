function copyWithExecCommand(text: string): void {
  if (typeof document === "undefined") {
    throw new Error("Clipboard unavailable");
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy failed");
    }
  } finally {
    document.body.removeChild(ta);
  }
}

/** Copy plain text to the clipboard. Prefer async Clipboard API; fall back for older hosts. */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission may be denied until the shell grants clipboard-sanitized-write.
      // Fall through to the legacy path when available.
    }
  }
  copyWithExecCommand(text);
}
