import type { ReactNode } from "react";
import { CopyButton } from "./copy-button";
import { cn } from "./lib/cn";

/** Shared fenced-code chrome: language label + copy control. */
export function MarkdownCodeBlock({
  language,
  text,
  children,
  className,
  "data-testid": testId,
}: {
  language: string;
  text: string;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn(
        "chat-markdown-codeblock border border-border/70 bg-secondary leading-snug dark:border-transparent dark:bg-input/32",
        className,
      )}
      data-testid={testId}
    >
      <div className="chat-markdown-codeblock-header select-none">
        <span className="chat-markdown-codeblock-title">{language || "code"}</span>
        <CopyButton
          text={text}
          label="Copy"
          copiedLabel="Copied"
          showLabel
          data-testid="copy-code-block"
          className="chat-markdown-codeblock-copy -my-0.5 h-6 px-2"
        />
      </div>
      {children}
    </div>
  );
}
