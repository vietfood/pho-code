import { GithubIcon } from "lucide-react";
import { InlineChip } from "./inline-chip-shell";
import { cn } from "./lib/cn";
import { githubLinkLabel } from "./lib/github-link";

export function GithubChip({
  url,
  owner,
  repo,
  className,
}: {
  url: string;
  owner: string;
  repo: string;
  className?: string;
}) {
  return (
    <InlineChip
      className={cn("github-chip", className)}
      data={{ "data-github-url": url, "data-github-owner": owner, "data-github-repo": repo }}
      title={url}
      ariaLabel={url}
      icon={<GithubIcon className="mention-chip-icon" aria-hidden="true" />}
      label={githubLinkLabel(owner, repo)}
    />
  );
}
