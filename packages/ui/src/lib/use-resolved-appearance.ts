import { useEffect, useState } from "react";
import type { AppearancePalette } from "@pho-code/protocol";
import {
  readAppearancePalette,
  readResolvedAppearance,
  type ResolvedAppearance,
} from "./appearance-theme";

export function useDocumentAppearance(): {
  appearance: ResolvedAppearance;
  palette: AppearancePalette;
} {  const [state, setState] = useState(() =>
    typeof document === "undefined"
      ? { appearance: "light" as const, palette: "default" as const }
      : {
          appearance: readResolvedAppearance(),
          palette: readAppearancePalette(),
        },
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      setState({
        appearance: readResolvedAppearance(root),
        palette: readAppearancePalette(root),
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-appearance", "data-palette"] });
    return () => {
      observer.disconnect();
    };
  }, []);

  return state;
}
