import { Info } from "lucide-react";

export function InfoDisclosure({ label, text, testId }: { label: string; text: string; testId: string }) {
  if (!text) return null;

  return (
    <details className="relative shrink-0">
      <summary
        className="flex size-5 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        aria-label={label}
        data-testid={`${testId}-trigger`}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </summary>
      <p
        className="glass-panel absolute left-0 z-20 mt-1 w-72 max-w-[calc(100vw-4rem)] rounded-lg border border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground shadow-lg"
        data-testid={testId}
      >
        {text}
      </p>
    </details>
  );
}
