import { afterEach, describe, expect, test } from "bun:test";
import { idleRunState } from "@pho-code/protocol";
import { getLiveRun, replaceLiveRun, resetLiveRunStore, subscribeLiveRun } from "../src/lib/live-run-store";

afterEach(() => {
  resetLiveRunStore();
});

describe("live run store", () => {
  test("immediate replace notifies subscribers with the latest run", () => {
    const seen: string[] = [];
    const stop = subscribeLiveRun(() => {
      seen.push(getLiveRun().streamingText);
    });
    replaceLiveRun(
      {
        status: "streaming",
        runId: "r1",
        streamingText: "hello",
        work: [],
      },
      { immediate: true },
    );
    expect(getLiveRun().streamingText).toBe("hello");
    expect(seen).toEqual(["hello"]);
    stop();
  });

  test("reset restores idle run state", () => {
    replaceLiveRun(
      {
        status: "streaming",
        runId: "r1",
        streamingText: "x",
        work: [],
      },
      { immediate: true },
    );
    resetLiveRunStore();
    expect(getLiveRun()).toEqual(idleRunState());
  });
});
