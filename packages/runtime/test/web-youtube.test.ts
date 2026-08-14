import { describe, expect, test } from "bun:test";
import {
  parseYouTubeCaptionBody,
  parseYouTubePlayerResponse,
  parseYouTubeVideoId,
} from "../src/web-youtube";

describe("YouTube extract helpers", () => {
  test("reads watch, shorts, and youtu.be ids and ignores playlists", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=abcdefghijk")).toBe("abcdefghijk");
    expect(parseYouTubeVideoId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    expect(parseYouTubeVideoId("https://www.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
    expect(parseYouTubeVideoId("https://www.youtube.com/playlist?list=PLxxxxx")).toBeNull();
  });

  test("reads player metadata and English caption tracks", () => {
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify({
      videoDetails: {
        title: "Talk",
        author: "Channel",
        shortDescription: "Intro",
        lengthSeconds: "75",
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: "https://example.com/de", languageCode: "de" },
            { baseUrl: "https://example.com/en", languageCode: "en-US" },
          ],
        },
      },
    })};</script>`;
    expect(parseYouTubePlayerResponse(html)).toEqual({
      title: "Talk",
      author: "Channel",
      description: "Intro",
      durationSeconds: 75,
      captionUrl: "https://example.com/en",
    });
  });

  test("formats XML and JSON caption bodies", () => {
    expect(parseYouTubeCaptionBody(`<transcript><text start="1.2">Hello</text></transcript>`)).toBe(
      "[0:01] Hello",
    );
    expect(
      parseYouTubeCaptionBody(
        JSON.stringify({
          events: [{ tStartMs: 2500, segs: [{ utf8: "World" }] }],
        }),
      ),
    ).toBe("[0:02] World");
  });
});
