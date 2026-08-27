import { useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_BRAND_ICONS, type BrandIconStyle } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { ColorPlateMark, CurrentColorMask } from "./lib/current-color-mask";
import { getBrandIconStyle, subscribeBrandIconStyle } from "./lib/appearance-theme";
import { LOBE_COLOR_ICONS } from "./lib/lobe-color-icons";
import {
  LOBE_ICONS,
  resolveModelIconId,
  resolveProviderIconId,
  type LobeIconId,
} from "./lib/lobe-brand-icons";

/**
 * Compact provider and model-type marks from @lobehub/icons-static-svg.
 * Mono paints through currentColor. Color uses Lobe `-color.svg` on a light plate.
 * See docs/references-and-attribution.md.
 */
export function ProviderIcon({
  provider,
  className,
  title,
  variant,
}: {
  provider: string;
  className?: string;
  title?: string;
  variant?: BrandIconStyle;
}) {
  return (
    <BrandMark
      iconId={resolveProviderIconId(provider)}
      fallback={provider}
      className={className}
      title={title}
      variant={variant}
      dataProvider={provider.trim().toLowerCase()}
    />
  );
}

export function ModelBrandIcon({
  provider,
  modelId,
  className,
  title,
  variant,
}: {
  provider: string;
  modelId: string;
  className?: string;
  title?: string;
  variant?: BrandIconStyle;
}) {
  return (
    <BrandMark
      iconId={resolveModelIconId(modelId, provider)}
      fallback={modelId || provider}
      className={className}
      title={title}
      variant={variant}
      dataProvider={provider.trim().toLowerCase()}
    />
  );
}

function BrandMark({
  iconId,
  fallback,
  className,
  title,
  variant,
  dataProvider,
}: {
  iconId: LobeIconId | undefined;
  fallback: string;
  className?: string;
  title?: string;
  variant?: BrandIconStyle;
  dataProvider: string;
}) {
  const documentStyle = useSyncExternalStore(
    subscribeBrandIconStyle,
    getBrandIconStyle,
    () => DEFAULT_BRAND_ICONS,
  );
  const style = variant ?? documentStyle;
  const mark = iconId ? lobeMarkSrc(iconId, style) : undefined;
  return (
    <span
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground",
        className,
      )}
      aria-hidden="true"
      data-provider={dataProvider}
      data-brand-style={style}
      {...(iconId ? { "data-lobe-icon": iconId } : {})}
      {...(title ? { title } : {})}
    >
      {mark ? (
        mark.colorful ? (
          <ColorPlateMark src={mark.src} />
        ) : (
          <CurrentColorMask src={mark.src} />
        )
      ) : (
        <LetterIcon label={fallback} />
      )}
    </span>
  );
}

function lobeMarkSrc(id: LobeIconId, style: BrandIconStyle): { src: string; colorful: boolean } {
  switch (style) {
    case "color": {
      const color = LOBE_COLOR_ICONS[id];
      if (color) {
        return { src: color, colorful: true };
      }
      return { src: LOBE_ICONS[id], colorful: false };
    }
    case "mono":
      return { src: LOBE_ICONS[id], colorful: false };
    default: {
      const exhaustive: never = style;
      return exhaustive;
    }
  }
}

function LetterIcon({ label }: { label: string }): ReactNode {
  const letter = (label.trim()[0] ?? "?").toUpperCase();
  return (
    <svg viewBox="0 0 16 16" className="size-full" fill="currentColor">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <text x="8" y="11" textAnchor="middle" fontSize="8" fontWeight="600">
        {letter}
      </text>
    </svg>
  );
}
