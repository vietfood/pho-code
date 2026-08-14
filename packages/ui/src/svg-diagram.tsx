import { MarkdownCodeBlock } from "./markdown-codeblock";
import { MarkdownImage } from "./markdown-image";
import { svgSourceToDataUrl } from "./lib/svg-data-url";

function SvgSourceFallback({ source }: { source: string }) {
  return (
    <pre>
      <code className="language-svg">{source}</code>
    </pre>
  );
}

export function SvgDiagram({ source }: { source: string }) {
  const dataUrl = svgSourceToDataUrl(source);
  if (!dataUrl) {
    return (
      <MarkdownCodeBlock language="svg" text={source}>
        <SvgSourceFallback source={source} />
      </MarkdownCodeBlock>
    );
  }

  return (
    <MarkdownCodeBlock language="svg" text={source} className="chat-markdown-svg" data-testid="svg-diagram">
      <MarkdownImage
        src={dataUrl}
        alt="SVG diagram"
        fallback={<SvgSourceFallback source={source} />}
      />
    </MarkdownCodeBlock>
  );
}
