import type { ReactNode } from "react";
import { ProviderIcon } from "../provider-icon";

export function githubWorkGlyph(className?: string): ReactNode {
  return <ProviderIcon provider="github" className={className} />;
}
