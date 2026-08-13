import type { SessionSnapshot } from "@pho-code/protocol";

export function isEmptyConversation(snapshot: SessionSnapshot): boolean {
  return (
    snapshot.messages.length === 0 &&
    snapshot.run.streamingText === "" &&
    snapshot.run.work.length === 0 &&
    snapshot.run.status !== "admitted" &&
    snapshot.run.status !== "streaming"
  );
}
