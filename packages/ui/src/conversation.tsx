import { useEffect } from "react";
import type {
  HostDialogRequest,
  ModelSummary,
  ResolveHostDialogInput,
  SessionSnapshot,
  ThinkingLevel,
} from "@pho-code/protocol";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { EmptySessionStage } from "./empty-session";
import { HostDialog } from "./host-dialog";
import { isEmptyConversation } from "./lib/empty-conversation";
import { Transcript } from "./transcript";

export function Conversation({
  snapshot,
  draft,
  onDraftChange,
  onSubmit,
  onStop,
  onModelChange,
  onThinkingChange,
  dialog,
  onResolveDialog,
  yoloMode,
}: {
  snapshot: SessionSnapshot;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onModelChange: (model: ModelSummary) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
  dialog?: HostDialogRequest | null;
  onResolveDialog?: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
  yoloMode?: boolean;
}) {
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
  const empty = isEmptyConversation(snapshot);

  useEffect(() => {
    if (!empty || dialog) {
      return;
    }
    document.getElementById("composer-input")?.focus();
  }, [dialog, empty]);

  const composer = (
    <Composer
      value={draft}
      onChange={onDraftChange}
      onSubmit={onSubmit}
      onStop={onStop}
      disabled={!snapshot.model && Boolean(snapshot.modelError)}
      running={running}
      models={snapshot.models}
      thinkingLevel={snapshot.thinkingLevel}
      availableThinkingLevels={snapshot.availableThinkingLevels}
      supportsThinking={snapshot.supportsThinking}
      selectorsDisabled={running}
      onModelChange={onModelChange}
      onThinkingChange={onThinkingChange}
      variant={empty ? "hero" : "docked"}
      {...(empty ? {} : { metaHint: snapshot.workspace.displayName })}
      {...(snapshot.model ? { selectedModel: snapshot.model } : {})}
      {...(snapshot.usage ? { usage: snapshot.usage } : {})}
      {...(snapshot.contextUsage ? { contextUsage: snapshot.contextUsage } : {})}
    />
  );
  const hostDialog = dialog && onResolveDialog ? <HostDialog request={dialog} onResolve={onResolveDialog} /> : null;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Conversation">
      <ChatHeader
        {...(snapshot.modelError ? { modelError: snapshot.modelError } : {})}
        {...(yoloMode ? { yoloMode: true } : {})}
      />
      {empty ? (
        <EmptySessionStage workspaceName={snapshot.workspace.displayName}>
          {hostDialog}
          {composer}
        </EmptySessionStage>
      ) : (
        <>
          <Transcript snapshot={snapshot} />
          <div className="chat-composer-horizontal-inset pointer-events-none shrink-0 pt-1.5 pb-4 sm:pt-2 sm:pb-5">
            <div className="pointer-events-auto mx-auto w-full max-w-3xl">
              {hostDialog}
              {composer}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
