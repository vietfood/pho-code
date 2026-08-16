import { useEffect, useState } from "react";
import { preferredShikiTheme, highlightCode, type ShikiThemeName } from "./shiki-highlight";
import { useDocumentAppearance } from "./lib/use-resolved-appearance";
import { cn } from "./lib/cn";

// Streaming-skip highlight pattern adapted from refs/t3code ChatMarkdown.tsx
// (MIT, T3 Tools Inc., 6bc6cb6). Suspense/use() omitted for a settled-only effect.

function useShikiTheme(): ShikiThemeName {
  const { appearance, palette } = useDocumentAppearance();
  return preferredShikiTheme(appearance === "dark", palette);
}

export function ShikiCodeBlock({
  code,
  language,
  className,
  lineNumbers = false,
}: {
  code: string;
  language: string;
  className?: string;
  lineNumbers?: boolean;
}) {
  const theme = useShikiTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const contentKey = `${theme}\0${language}\0${code}`;
  const showPlain = html === null || renderedKey !== contentKey;

  useEffect(() => {
    let cancelled = false;
    void highlightCode(code, language, theme).then((next) => {
      if (cancelled) {
        return;
      }
      setHtml(next);
      setRenderedKey(contentKey);
    });
    return () => {
      cancelled = true;
    };
  }, [code, contentKey, language, theme]);

  if (showPlain) {
    if (lineNumbers) {
      const lines = code.split("\n");
      return (
        <pre className={className}>
          <code>
            {lines.map((line, index) => (
              <span className="line" key={`plain-${index}`}>
                {line.length === 0 ? " " : line}
              </span>
            ))}
          </code>
        </pre>
      );
    }
    return (
      <pre>
        <code className={className}>{code}</code>
      </pre>
    );
  }

  return <div className={cn("chat-markdown-shiki", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
