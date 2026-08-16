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
    <div className={cn("chat-markdown-codeblock", className)} data-testid={testId}>
      <div className="chat-markdown-codeblock-header select-none">
        <span className="chat-markdown-codeblock-title">{language || "code"}</span>
        <CopyButton
          text={text}
          label="Copy"
          copiedLabel="Copied"
          variant="ghost"
          data-testid="copy-code-block"
          className="chat-markdown-codeblock-copy size-5"
        />
      </div>
      {children}
    </div>
  );
}
