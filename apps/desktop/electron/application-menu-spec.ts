export const WINDOW_RELOAD_ACCELERATOR = "CommandOrControl+Shift+R";

export type ApplicationMenuViewItem =
  | { readonly kind: "reload"; readonly accelerator: typeof WINDOW_RELOAD_ACCELERATOR; readonly label: "Reload" }
  | { readonly kind: "role"; readonly role: "toggleDevTools" | "resetZoom" | "zoomIn" | "zoomOut" | "togglefullscreen" }
  | { readonly kind: "separator" };

export function applicationMenuViewItems(): readonly ApplicationMenuViewItem[] {
  return [
    { kind: "reload", accelerator: WINDOW_RELOAD_ACCELERATOR, label: "Reload" },
    { kind: "role", role: "toggleDevTools" },
    { kind: "separator" },
    { kind: "role", role: "resetZoom" },
    { kind: "role", role: "zoomIn" },
    { kind: "role", role: "zoomOut" },
    { kind: "separator" },
    { kind: "role", role: "togglefullscreen" },
  ];
}

export function viewMenuClaimsPrimaryR(items: readonly ApplicationMenuViewItem[] = applicationMenuViewItems()): boolean {
  return items.some((item) => item.kind === "reload" && !item.accelerator.includes("Shift"));
}
