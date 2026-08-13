import { useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { cn } from "./lib/cn";
import { rehypeStreamTail } from "./lib/rehype-stream-tail";
import { markdownUrlTransform, safeMarkdownImageSrc } from "./lib/safe-markdown-image-src";
import { MarkdownCodeBlock } from "./markdown-codeblock";
import { MarkdownImage } from "./markdown-image";
import { MermaidDiagram } from "./mermaid-diagram";
import { ShikiCodeBlock } from "./shiki-code";
import "katex/dist/katex.min.css";

// Chat markdown presentation adapted from refs/t3code ChatMarkdown.tsx + index.css
// (MIT, T3 Tools Inc., 6bc6cb6). rehype-raw and file-link graph omitted; code-block
// copy uses harness CopyButton (T3 chrome pattern). Shiki highlighting adapted
// separately in shiki-code.tsx. KaTeX via remark-math + rehype-katex after sanitize
// (official safe order). Markdown images: http(s)/data only with lightbox;
// workspace/file: deferred.

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https"],
    src: ["http", "https", "data"],
  },
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/u, "math-inline", "math-display"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "math-inline", "math-display"]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", "math", "math-display", "math-inline"]],
  },
};

function PlainCodeBlock({ language, className, text }: { language: string; className?: string; text: string }) {
  return (
    <MarkdownCodeBlock language={language} text={text}>
      <pre>
        <code className={className}>{text}</code>
      </pre>
    </MarkdownCodeBlock>
  );
}

function ImageFallback({ alt }: { alt?: string }) {
  const text = alt?.trim() || "Image unavailable";
  return (
    <span className="chat-markdown-image-fallback text-muted-foreground" data-testid="markdown-image-fallback">
      {text}
    </span>
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
    img({ src, alt }) {
      const safeSrc = safeMarkdownImageSrc(typeof src === "string" ? src : null);
      if (!safeSrc) {
        return <ImageFallback alt={typeof alt === "string" ? alt : undefined} />;
      }
      return <MarkdownImage src={safeSrc} alt={typeof alt === "string" ? alt : ""} />;
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
        <MarkdownCodeBlock language={language} text={text}>
          <ShikiCodeBlock code={text} language={language} className={className} />
        </MarkdownCodeBlock>
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
  streamTail = false,
  streamCaret = false,
}: {
  text: string;
  className?: string;
  isStreaming?: boolean;
  streamTail?: boolean;
  streamCaret?: boolean;
}) {
  const components = useMemo(() => createComponents(isStreaming), [isStreaming]);

  return (
    <div className={cn("chat-markdown w-full min-w-0 text-sm leading-relaxed text-foreground/80", className)} data-testid="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={
          streamTail
            ? // Wrap the last word after sanitize/KaTeX so stream-in CSS cannot
              // inject unsanitized HTML. Code and math subtrees are left intact.
              [[rehypeSanitize, sanitizeSchema], rehypeKatex, [rehypeStreamTail, { caret: streamCaret }]]
            : [[rehypeSanitize, sanitizeSchema], rehypeKatex]
        }
        urlTransform={markdownUrlTransform}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
