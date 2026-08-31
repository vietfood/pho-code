export interface CompletedGitHubLink {
  url: string;
  owner: string;
  repo: string;
  start: number;
  end: number;
}

const LINK_BOUNDARY = /[\s([{<'"]/u;
const CLONE_SUFFIX = ".git";
// Start and end on alnum so a sentence period stays punctuation, while
// internal dots (`next.js`) and a clone `.git` stay inside the URL.
const GITHUB_REPO_URL =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)\/([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)(?:\/)?(?=[\s.,;:!?)\]}'"]|$)/u;

export function githubLinkLabel(owner: string, repo: string): string {
  return `${owner}/${stripCloneSuffix(repo)}`;
}

export function findCompletedGitHubLinks(text: string): CompletedGitHubLink[] {
  const matches: CompletedGitHubLink[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "h" && text[index] !== "H") {
      continue;
    }
    if (index > 0 && !LINK_BOUNDARY.test(text[index - 1] ?? "")) {
      continue;
    }
    const slice = text.slice(index);
    const consumed = GITHUB_REPO_URL.exec(slice);
    if (!consumed) {
      continue;
    }
    const owner = consumed[1];
    const repo = consumed[2];
    if (!owner || !repo) {
      continue;
    }
    const end = index + consumed[0].length;
    matches.push({
      url: text.slice(index, end),
      owner,
      repo: stripCloneSuffix(repo),
      start: index,
      end,
    });
    index = end - 1;
  }
  return matches;
}

function stripCloneSuffix(repo: string): string {
  return repo.endsWith(CLONE_SUFFIX) ? repo.slice(0, -CLONE_SUFFIX.length) : repo;
}
