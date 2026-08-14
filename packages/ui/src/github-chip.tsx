import { GithubIcon } from "lucide-react";
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
  const label = githubLinkLabel(owner, repo);
  return (
    <span
      className={cn("mention-chip github-chip", className)}
      data-github-url={url}
      data-github-owner={owner}
      data-github-repo={repo}
      title={url}
      aria-label={url}
    >
      <GithubIcon className="mention-chip-icon" aria-hidden="true" />
      <span className="mention-chip-label">{label}</span>
    </span>
  );
}
