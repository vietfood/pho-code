import { useEffect, useState } from "react";
import { readResolvedAppearance, type ResolvedAppearance } from "./appearance-theme";

/** Follows html[data-appearance] after applyAppearanceTheme. */
export function useResolvedAppearance(): ResolvedAppearance {
  const [appearance, setAppearance] = useState<ResolvedAppearance>(() =>
    typeof document === "undefined" ? "light" : readResolvedAppearance(),
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      setAppearance(readResolvedAppearance(root));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-appearance"] });
    return () => {
      observer.disconnect();
    };
  }, []);

  return appearance;
}
