import { useState } from "react";
import { GlobeIcon } from "lucide-react";
import { cn } from "./lib/cn";
import { siteBadgeColor, siteFaviconSrc } from "./lib/web-source";

const SIZE_CLASS = {
  sm: "size-3.5",
  md: "size-4",
} as const;

const GLOBE_CLASS = {
  sm: "size-2",
  md: "size-2.5",
} as const;

export function WebSiteIcon({ host, size = "md" }: { host: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const favicon = failed ? null : siteFaviconSrc(host);
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-white ring-1 ring-background",
        SIZE_CLASS[size],
      )}
      style={{ backgroundColor: siteBadgeColor(host) }}
      data-testid="web-site-icon"
      data-host={host}
      aria-hidden="true"
    >
      <GlobeIcon className={cn("relative stroke-[2.2]", GLOBE_CLASS[size])} />
      {favicon ? (
        <img
          src={favicon}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}
