import { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { cn } from "./lib/cn";
import { MermaidDiagram } from "./mermaid-diagram";
import { ShikiCodeBlock } from "./shiki-code";
import "katex/dist/katex.min.css";

// Chat markdown presentation adapted from refs/t3code ChatMarkdown.tsx + index.css
// (MIT, T3 Tools Inc., 6bc6cb6). rehype-raw, file-link graph, and clipboard menus
// omitted. Shiki highlighting adapted separately in shiki-code.tsx. KaTeX via
// remark-math + rehype-katex after sanitize (official safe order).

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https"],
  },
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== "img"),
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/u, "math-inline", "math-display"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "math-inline", "math-display"]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", "math", "math-display", "math-inline"]],
  },
};

function PlainCodeBlock({ language, className, text }: { language: string; className?: string; text: string }) {
  return (
    <div className="chat-markdown-codeblock border border-border/70 bg-secondary leading-snug dark:border-transparent dark:bg-input/32">
      <div className="chat-markdown-codeblock-header select-none">
        <span className="chat-markdown-codeblock-title">{language || "code"}</span>
      </div>
      <pre>
        <code className={className}>{text}</code>
      </pre>
    </div>
  );
}

function createComponents(isStreaming: boolean): Components {
  return {
    a({ href, children }) {
      if (!href || !/^https?:\/\//u.test(href)) {
        return <span>{children}</span>;
      }
      return <a href={href}>{children}</a>;
    },
    code({ className, children }) {
      const text = String(children).replace(/\n$/u, "");
      const isBlock = Boolean(className) || text.includes("\n");
      if (!isBlock) {
        return <code>{children}</code>;
      }
      const language = className?.replace(/^language-/u, "") ?? "";
      if (language === "mermaid") {
        if (isStreaming) {
          return <PlainCodeBlock language={language} className={className} text={text} />;
        }
        return <MermaidDiagram source={text} />;
      }
      if (isStreaming) {
        return <PlainCodeBlock language={language} className={className} text={text} />;
      }
      return (
        <div className="chat-markdown-codeblock border border-border/70 bg-secondary leading-snug dark:border-transparent dark:bg-input/32">
          <div className="chat-markdown-codeblock-header select-none">
            <span className="chat-markdown-codeblock-title">{language || "code"}</span>
          </div>
          <ShikiCodeBlock code={text} language={language} className={className} />
        </div>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    table({ children }) {
      return (
        <div className="chat-markdown-table-container overflow-x-auto">
          <table>{children}</table>
        </div>
      );
    },
  };
}

export function ConservativeMarkdown({
  text,
  className,
  isStreaming = false,
}: {
  text: string;
  className?: string;
  isStreaming?: boolean;
}) {
  const components = useMemo(() => createComponents(isStreaming), [isStreaming]);

  return (
    <div className={cn("chat-markdown w-full min-w-0 text-sm leading-relaxed text-foreground/80", className)} data-testid="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeKatex]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
