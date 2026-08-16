import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { applicationMenuViewItems, type ApplicationMenuViewItem } from "./application-menu-spec";

export { WINDOW_RELOAD_ACCELERATOR } from "./application-menu-spec";

function reloadFocusedWindow(): void {
  (BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0])?.reload();
}

function viewMenuItem(item: ApplicationMenuViewItem): MenuItemConstructorOptions {
  switch (item.kind) {
    case "reload":
      return {
        label: item.label,
        accelerator: item.accelerator,
        click: () => {
          reloadFocusedWindow();
        },
      };
    case "separator":
      return { type: "separator" };
    case "role":
      return { role: item.role };
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}

function applicationMenuTemplate(): MenuItemConstructorOptions[] {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [];
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  } else {
    template.push({
      label: "File",
      submenu: [{ role: "quit" }],
    });
  }
  template.push(
    { role: "editMenu" },
    {
      label: "View",
      submenu: applicationMenuViewItems().map(viewMenuItem),
    },
    { role: "windowMenu" },
  );
  return template;
}

export function installApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate()));
}
