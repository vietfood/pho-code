import { useEffect, useState } from "react";
import { preferredShikiTheme, highlightCode, type ShikiThemeName } from "./shiki-highlight";
import { useResolvedAppearance } from "./lib/use-resolved-appearance";

// Streaming-skip highlight pattern adapted from refs/t3code ChatMarkdown.tsx
// (MIT, T3 Tools Inc., 6bc6cb6). Suspense/use() omitted for a settled-only effect.

function useShikiTheme(): ShikiThemeName {
  const appearance = useResolvedAppearance();
  return preferredShikiTheme(appearance === "dark");
}

export function ShikiCodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language: string;
  className?: string;
}) {
  const theme = useShikiTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const contentKey = `${language}\0${code}`;
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
    return (
      <pre>
        <code className={className}>{code}</code>
      </pre>
    );
  }

  return <div className="chat-markdown-shiki" dangerouslySetInnerHTML={{ __html: html }} />;
}
