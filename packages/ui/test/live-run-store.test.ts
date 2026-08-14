import { afterEach, describe, expect, test } from "bun:test";
import { idleRunState, type RunState } from "@pho-code/protocol";
import {
  dropLiveRun,
  getLiveRun,
  getLiveRunForKey,
  replaceLiveRun,
  resetLiveRunStore,
  selectLiveRunKey,
  subscribeLiveRun,
} from "../src/lib/live-run-store";

afterEach(() => {
  resetLiveRunStore();
});

function streamingRun(text: string): RunState {
  return {
    status: "streaming",
    runId: "r1",
    streamingText: "",
    work: [{ type: "thinking", text }],
  };
}

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

  test("background keys accumulate thinking without notifying the selected transcript", () => {
    selectLiveRunKey("chat-b");
    replaceLiveRun(streamingRun("visible B"), { immediate: true, key: "chat-b" });
    const seen: string[] = [];
    const stop = subscribeLiveRun(() => {
      const thinking = getLiveRun().work[0];
      seen.push(thinking?.type === "thinking" ? thinking.text : "");
    });

    replaceLiveRun(streamingRun("hidden A"), { immediate: true, key: "chat-a" });
    expect(getLiveRun().work).toEqual([{ type: "thinking", text: "visible B" }]);
    expect(getLiveRunForKey("chat-a")?.work).toEqual([{ type: "thinking", text: "hidden A" }]);
    expect(seen).toEqual([]);

    selectLiveRunKey("chat-a");
    expect(getLiveRun().work).toEqual([{ type: "thinking", text: "hidden A" }]);
    expect(seen).toEqual(["hidden A"]);
    stop();
  });

  test("dropLiveRun forgets a background chat", () => {
    replaceLiveRun(streamingRun("keep"), { immediate: true, key: "chat-a" });
    dropLiveRun("chat-a");
    expect(getLiveRunForKey("chat-a")).toBeUndefined();
  });
});
