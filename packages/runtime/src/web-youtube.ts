import { parseHTML } from "linkedom";
import { MAX_WEB_EXTRACTED_CHARS } from "@pho-code/protocol";
import type { WebPageRequest } from "./web-url";
import { isHttpUrl, isPlainRecord, readBoundedResponseText, readString, WebResearchError } from "./web-url";

export const YOUTUBE_WATCH_ORIGIN = "https://www.youtube.com";
export const YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed";

// YouTube URL detection adapted from pi-web-access 0.22.0 youtube-extract.ts (MIT).
const YOUTUBE_REGEX =
  /(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?.*v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/u;

export interface YouTubeExtractPage {
  title: string;
  text: string;
  url: string;
}

export function parseYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/playlist" || parsed.pathname === "/results") {
      return null;
    }
  } catch {
    return null;
  }
  return url.match(YOUTUBE_REGEX)?.[1] ?? null;
}

export function canonicalYouTubeWatchUrl(videoId: string): string {
  return `${YOUTUBE_WATCH_ORIGIN}/watch?v=${videoId}`;
}

export async function extractYouTubeContent(
  url: string,
  signal: AbortSignal,
  fetchPage: WebPageRequest,
): Promise<YouTubeExtractPage> {
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) {
    throw new WebResearchError("fetch_content/youtube", "The URL is not a YouTube video.", false);
  }
  const watchUrl = canonicalYouTubeWatchUrl(videoId);
  const oembed = await fetchYouTubeOEmbed(watchUrl, signal, fetchPage);
  const player = await fetchYouTubePlayer(watchUrl, signal, fetchPage);
  const title = player.title || oembed?.title || "YouTube video";
  const author = player.author || oembed?.author || "";
  const duration = player.durationSeconds ? formatDuration(player.durationSeconds) : "";
  const description = player.description;
  let captions = "";
  if (player.captionUrl) {
    captions = await fetchYouTubeCaptions(player.captionUrl, signal, fetchPage);
  }
  const sections = [
    author ? `Channel: ${author}` : "",
    duration ? `Duration: ${duration}` : "",
    `Watch: ${watchUrl}`,
    description ? `## Description\n\n${description}` : "",
    captions
      ? `## Transcript\n\n${captions}`
      : "No public captions were available. Visual frame analysis is not implemented; Gemini cookie/API video understanding is not used.",
  ].filter((section) => section !== "");
  const text = `# ${title}\n\nSource: ${watchUrl}\n\n${sections.join("\n\n")}`.slice(0, MAX_WEB_EXTRACTED_CHARS);
  if (title === "YouTube video" && description === "" && captions === "") {
    throw new WebResearchError(
      "fetch_content/youtube",
      "Could not extract YouTube metadata or captions.",
      true,
    );
  }
  return { title, text, url: watchUrl };
}

export function parseYouTubePlayerResponse(html: string): {
  title: string;
  author: string;
  description: string;
  durationSeconds: number | null;
  captionUrl: string | null;
} {
  const parsed = extractAssignedJson(html, "ytInitialPlayerResponse");
  if (!isPlainRecord(parsed)) {
    return { title: "", author: "", description: "", durationSeconds: null, captionUrl: null };
  }
  const details = isPlainRecord(parsed.videoDetails) ? parsed.videoDetails : {};
  const title = readString(details, ["title"]) ?? "";
  const author = readString(details, ["author"]) ?? "";
  const description = readString(details, ["shortDescription"]) ?? "";
  const durationRaw = readString(details, ["lengthSeconds"]);
  const durationSeconds = durationRaw && /^\d+$/u.test(durationRaw) ? Number(durationRaw) : null;
  return {
    title,
    author,
    description,
    durationSeconds,
    captionUrl: selectCaptionUrl(parsed),
  };
}

export function parseYouTubeCaptionBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed === "") {
    return "";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return formatJsonCaptions(JSON.parse(trimmed));
    } catch {
      // Fall through to XML.
    }
  }
  const { document } = parseHTML(trimmed);
  const lines: string[] = [];
  for (const node of document.querySelectorAll("text")) {
    const start = Number(node.getAttribute("start") ?? "0");
    const text = (node.textContent ?? "").replace(/\s+/gu, " ").trim();
    if (text === "") {
      continue;
    }
    lines.push(`[${formatDuration(start)}] ${text}`);
  }
  return lines.join("\n");
}

export function extractAssignedJson(source: string, assignment: string): unknown {
  const needle = `${assignment} = `;
  const start = source.indexOf(needle);
  if (start < 0) {
    return null;
  }
  const brace = source.indexOf("{", start);
  if (brace < 0) {
    return null;
  }
  return parseJsonObject(source, brace);
}

function parseJsonObject(source: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (character === "\\") {
        escape = true;
        continue;
      }
      if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchYouTubeOEmbed(
  watchUrl: string,
  signal: AbortSignal,
  fetchPage: WebPageRequest,
): Promise<{ title: string; author: string } | null> {
  const endpoint = new URL(YOUTUBE_OEMBED_ENDPOINT);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("url", watchUrl);
  try {
    const { response } = await fetchPage(
      endpoint.toString(),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
      },
      { stage: "fetch_content/youtube", signal },
    );
    if (!response.ok) {
      return null;
    }
    const parsed: unknown = JSON.parse(await readBoundedResponseText(response, "fetch_content/youtube"));
    if (!isPlainRecord(parsed)) {
      return null;
    }
    return {
      title: readString(parsed, ["title"]) ?? "",
      author: readString(parsed, ["author_name"]) ?? "",
    };
  } catch {
    return null;
  }
}

async function fetchYouTubePlayer(
  watchUrl: string,
  signal: AbortSignal,
  fetchPage: WebPageRequest,
): Promise<ReturnType<typeof parseYouTubePlayerResponse>> {
  try {
    const { response } = await fetchPage(
      watchUrl,
      {
        method: "GET",
        headers: { Accept: "text/html", "Accept-Language": "en" },
        credentials: "omit",
      },
      { stage: "fetch_content/youtube", signal },
    );
    if (!response.ok) {
      return { title: "", author: "", description: "", durationSeconds: null, captionUrl: null };
    }
    const html = await readBoundedResponseText(response, "fetch_content/youtube");
    return parseYouTubePlayerResponse(html);
  } catch {
    return { title: "", author: "", description: "", durationSeconds: null, captionUrl: null };
  }
}

async function fetchYouTubeCaptions(
  captionUrl: string,
  signal: AbortSignal,
  fetchPage: WebPageRequest,
): Promise<string> {
  try {
    const { response } = await fetchPage(
      captionUrl,
      {
        method: "GET",
        headers: { Accept: "text/xml, application/xml, application/json, text/plain" },
        credentials: "omit",
      },
      { stage: "fetch_content/youtube", signal },
    );
    if (!response.ok) {
      return "";
    }
    return parseYouTubeCaptionBody(await readBoundedResponseText(response, "fetch_content/youtube"));
  } catch {
    return "";
  }
}

function selectCaptionUrl(player: Record<string, unknown>): string | null {
  const captions = isPlainRecord(player.captions) ? player.captions : null;
  const renderer = captions && isPlainRecord(captions.playerCaptionsTracklistRenderer)
    ? captions.playerCaptionsTracklistRenderer
    : null;
  const tracks = renderer && Array.isArray(renderer.captionTracks) ? renderer.captionTracks.filter(isPlainRecord) : [];
  const preferred =
    tracks.find((track) => (readString(track, ["languageCode"]) ?? "").toLowerCase().startsWith("en")) ?? tracks[0];
  const baseUrl = preferred ? readString(preferred, ["baseUrl"]) : undefined;
  return baseUrl && isHttpUrl(baseUrl) ? baseUrl : null;
}

function formatJsonCaptions(parsed: unknown): string {
  const events = Array.isArray(parsed)
    ? parsed
    : isPlainRecord(parsed) && Array.isArray(parsed.events)
      ? parsed.events
      : [];
  const lines: string[] = [];
  for (const event of events) {
    if (!isPlainRecord(event)) {
      continue;
    }
    const startMs = typeof event.tStartMs === "number" ? event.tStartMs : 0;
    const segs = Array.isArray(event.segs) ? event.segs : [];
    const text = segs
      .map((seg) => (isPlainRecord(seg) ? readString(seg, ["utf8"]) ?? "" : ""))
      .join("")
      .replace(/\s+/gu, " ")
      .trim();
    if (text === "") {
      continue;
    }
    lines.push(`[${formatDuration(startMs / 1000)}] ${text}`);
  }
  return lines.join("\n");
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
