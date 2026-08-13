import { useEffect, useId, useRef, useState } from "react";

type MermaidThemeName = "dark" | "default";

function preferredMermaidTheme(prefersDark: boolean): MermaidThemeName {
  return prefersDark ? "dark" : "default";
}

function useMermaidTheme(): MermaidThemeName {
  const [theme, setTheme] = useState<MermaidThemeName>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return "default";
    }
    return preferredMermaidTheme(window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setTheme(preferredMermaidTheme(media.matches));
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  return theme;
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
      <div className="chat-markdown-codeblock border border-border/70 bg-secondary leading-snug dark:border-transparent dark:bg-input/32">
        <div className="chat-markdown-codeblock-header select-none">
          <span className="chat-markdown-codeblock-title">mermaid</span>
        </div>
        <pre>
          <code className="language-mermaid">{source}</code>
        </pre>
      </div>
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
