export function isMacDesktop(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent);
}

export function localMachineLabel(isMac = isMacDesktop()): string {
  return isMac ? "This Mac" : "This computer";
}
