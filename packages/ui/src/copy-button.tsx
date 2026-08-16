import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { copyText } from "./lib/clipboard";
import { cn } from "./lib/cn";
import { Button } from "./ui/button";

// Copy affordance pattern informed by refs/t3code ChatMarkdown code-block chrome
// and refs/pi-web MessageView copy action (MIT). Implementation is harness-owned.

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  className,
  showLabel = false,
  variant = "outline",
  "data-testid": testId,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  /** When true, show the label text beside the icon. Message copy is icon-only. */
  showLabel?: boolean;
  variant?: "outline" | "ghost";
  "data-testid"?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const ariaLabel = copied ? copiedLabel : label;
  const visibleLabel = copied ? copiedLabel : label;

  return (
    <Button
      type="button"
      size={showLabel ? "sm" : "icon-sm"}
      variant={variant}
      className={cn(
        "shrink-0 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground",
        variant === "outline" && "border-border/80 bg-background/80",
        variant === "ghost" && "border-transparent bg-transparent",
        showLabel ? "h-7 gap-1.5 px-2.5 text-xs font-medium" : "size-6",
        copied && "text-foreground",
        copied && variant === "outline" && "border-border",
        className,
      )}
      aria-label={ariaLabel}
      title={ariaLabel}
      data-testid={testId}
      data-copied={copied ? "true" : "false"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!text) {
          return;
        }
        void copyText(text)
          .then(() => {
            if (timerRef.current != null) {
              clearTimeout(timerRef.current);
            }
            setCopied(true);
            timerRef.current = setTimeout(() => {
              setCopied(false);
              timerRef.current = null;
            }, 1400);
          })
          .catch(() => {
            // Quiet failure: host may deny clipboard without a user-visible toast surface yet.
          });
      }}
    >
      {copied ? (
        <CheckIcon className="size-3.5" aria-hidden="true" />
      ) : (
        <CopyIcon className="size-3.5" aria-hidden="true" />
      )}
      {showLabel ? <span>{visibleLabel}</span> : null}
    </Button>
  );
}
