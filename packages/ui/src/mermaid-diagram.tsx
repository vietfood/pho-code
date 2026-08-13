import { useEffect, useId, useRef, useState } from "react";
import { useResolvedAppearance } from "./lib/use-resolved-appearance";
import { MarkdownCodeBlock } from "./markdown-codeblock";

type MermaidThemeName = "dark" | "default";

function preferredMermaidTheme(prefersDark: boolean): MermaidThemeName {
  return prefersDark ? "dark" : "default";
}

function useMermaidTheme(): MermaidThemeName {
  const appearance = useResolvedAppearance();
  return preferredMermaidTheme(appearance === "dark");
}

async function renderMermaidSvg(source: string, theme: MermaidThemeName, renderId: string): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme,
    fontFamily: "inherit",
  });
  const { svg } = await mermaid.render(renderId, source);
  return svg;
}

export function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId().replace(/:/gu, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const theme = useMermaidTheme();

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    void (async () => {
      try {
        const renderId = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 9)}`;
        const svg = await renderMermaidSvg(source, theme, renderId);
        if (cancelled || !containerRef.current) {
          return;
        }
        // Swap in one assignment so the previous diagram stays visible until ready.
        containerRef.current.innerHTML = svg;
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reactId, source, theme]);

  if (failed) {
    return (
      <MarkdownCodeBlock language="mermaid" text={source}>
        <pre>
          <code className="language-mermaid">{source}</code>
        </pre>
      </MarkdownCodeBlock>
    );
  }

  return (
    <div
      ref={containerRef}
      className="chat-markdown-mermaid overflow-x-auto"
      data-testid="mermaid-diagram"
      data-mermaid-theme={theme}
      role="img"
      aria-label="Mermaid diagram"
    />
  );
}
