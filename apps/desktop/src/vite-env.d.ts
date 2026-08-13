/// <reference types="vite/client" />

import type { DesktopBridge } from "@pho-code/protocol";

export {};

declare global {
  interface Window {
    phoCode?: DesktopBridge;
  }
}
