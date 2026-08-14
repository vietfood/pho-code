export function isMacDesktop(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent);
}

export function localMachineLabel(isMac = isMacDesktop()): string {
  return isMac ? "This Mac" : "This computer";
}

export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 17) {
    return "Good afternoon";
  }
  return "Good evening";
}
