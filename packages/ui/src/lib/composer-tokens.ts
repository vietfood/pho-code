import {
  findCompletedAtMentions,
  findCompletedSkillTokens,
  formatSkillToken,
  type SkillSourceId,
} from "@pho-code/protocol";
import type { MentionSkipRange } from "./at-mention";
import { findCompletedGitHubLinks } from "./github-link";
import type { SlashQuery } from "./slash-query";

export type ComposerSegment =
  | { type: "text"; text: string }
  | { type: "mention"; path: string }
  | { type: "skill"; sourceId: SkillSourceId; skillName: string }
  | { type: "github"; url: string; owner: string; repo: string };

export function insertSkillToken(
  text: string,
  slash: SlashQuery,
  cursor: number,
  sourceId: SkillSourceId,
  skillName: string,
): { text: string; cursor: number } {
  const after = text.slice(cursor);
  const inserted = formatSkillToken(sourceId, skillName);
  const replacement = /^\s/u.test(after) ? inserted : `${inserted} `;
  const next = `${text.slice(0, slash.start)}${replacement}${after}`;
  return {
    text: next,
    cursor: slash.start + replacement.length,
  };
}

export function parseComposerSegments(text: string, skip?: MentionSkipRange): ComposerSegment[] {
  if (text === "") {
    return [{ type: "text", text: "" }];
  }

  const tokens: Array<{ start: number; end: number; segment: Exclude<ComposerSegment, { type: "text" }> }> = [];
  for (const match of findCompletedAtMentions(text)) {
    if (skip && rangesOverlap(match.start, match.end, skip.start, skip.end)) {
      continue;
    }
    tokens.push({ start: match.start, end: match.end, segment: { type: "mention", path: match.path } });
  }
  for (const match of findCompletedSkillTokens(text)) {
    if (skip && rangesOverlap(match.start, match.end, skip.start, skip.end)) {
      continue;
    }
    tokens.push({
      start: match.start,
      end: match.end,
      segment: { type: "skill", sourceId: match.sourceId, skillName: match.skillName },
    });
  }
  for (const match of findCompletedGitHubLinks(text)) {
    if (skip && rangesOverlap(match.start, match.end, skip.start, skip.end)) {
      continue;
    }
    tokens.push({
      start: match.start,
      end: match.end,
      segment: { type: "github", url: match.url, owner: match.owner, repo: match.repo },
    });
  }
  tokens.sort((left, right) => left.start - right.start);

  const segments: ComposerSegment[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) {
      continue;
    }
    if (token.start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, token.start) });
    }
    segments.push(token.segment);
    cursor = token.end;
  }
  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }
  if (segments.length === 0) {
    return [{ type: "text", text }];
  }
  return segments;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}
