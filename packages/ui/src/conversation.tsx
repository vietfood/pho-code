import { useEffect } from "react";
import type {
  HostDialogRequest,
  ModelSummary,
  PreparedImageSummary,
  ResolveHostDialogInput,
  SearchWorkspaceReferencesResult,
  SessionSnapshot,
  ThinkingLevel,
} from "@pho-code/protocol";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { EmptySessionStage } from "./empty-session";
import { HostDialog } from "./host-dialog";
import { cn } from "./lib/cn";
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
  switching = false,
  sidebarCollapsed,
  onToggleSidebar,
  onSearchReferences,
  images,
  onSteer,
  onFollowUp,
  onPickImages,
  onPasteImages,
  onRemoveImage,
  onRewrite,
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
  switching?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onSearchReferences?: (query: string) => Promise<SearchWorkspaceReferencesResult>;
  images?: readonly PreparedImageSummary[];
  onSteer?: () => void;
  onFollowUp?: () => void;
  onPickImages?: () => void;
  onPasteImages?: (files: readonly File[]) => void;
  onRemoveImage?: (imageId: string) => void;
  onRewrite?: (input: { messageId: string; text: string }) => void | Promise<void>;
}) {
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
  const empty = isEmptyConversation(snapshot);

  useEffect(() => {
    if (switching || !empty || dialog) {
      return;
    }
    document.getElementById("composer-input")?.focus();
  }, [dialog, empty, switching]);

  const composer = (
    <Composer
      value={draft}
      onChange={onDraftChange}
      onSubmit={onSubmit}
      onStop={onStop}
      disabled={switching || (!snapshot.model && Boolean(snapshot.modelError))}
      running={running}
      models={snapshot.models}
      thinkingLevel={snapshot.thinkingLevel}
      availableThinkingLevels={snapshot.availableThinkingLevels}
      supportsThinking={snapshot.supportsThinking}
      selectorsDisabled={switching || running}
      onModelChange={onModelChange}
      onThinkingChange={onThinkingChange}
      variant={empty ? "hero" : "docked"}
      {...(empty ? {} : { metaHint: snapshot.workspace.displayName })}
      {...(snapshot.model ? { selectedModel: snapshot.model } : {})}
      {...(snapshot.usage ? { usage: snapshot.usage } : {})}
      {...(snapshot.contextUsage ? { contextUsage: snapshot.contextUsage } : {})}
      {...(onSearchReferences ? { onSearchReferences } : {})}
      {...(images ? { images } : {})}
      {...(snapshot.queue ? { queue: snapshot.queue } : {})}
      {...(onSteer ? { onSteer } : {})}
      {...(onFollowUp ? { onFollowUp } : {})}
      {...(onPickImages ? { onPickImages } : {})}
      {...(onPasteImages ? { onPasteImages } : {})}
      {...(onRemoveImage ? { onRemoveImage } : {})}
    />
  );
  const hostDialog =
    !switching && dialog && onResolveDialog ? <HostDialog request={dialog} onResolve={onResolveDialog} /> : null;

  return (
    <section
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden",
        switching && "session-switching",
      )}
      aria-label="Conversation"
      aria-busy={switching}
    >
      <div className="session-pane-body flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatHeader
          {...(snapshot.modelError ? { modelError: snapshot.modelError } : {})}
          {...(yoloMode ? { yoloMode: true } : {})}
          {...(sidebarCollapsed ? { sidebarCollapsed: true } : {})}
          {...(onToggleSidebar ? { onToggleSidebar } : {})}
        />
        {empty ? (
          <EmptySessionStage workspaceName={snapshot.workspace.displayName}>
            {hostDialog}
            {composer}
          </EmptySessionStage>
        ) : (
          <>
            <Transcript snapshot={snapshot} {...(onRewrite ? { onRewrite } : {})} />
            <div className="chat-composer-horizontal-inset pointer-events-none shrink-0 pt-1.5 pb-4 sm:pt-2 sm:pb-5">
              <div className="pointer-events-auto mx-auto w-full max-w-3xl">
                {hostDialog}
                {composer}
              </div>
            </div>
          </>
        )}
      </div>
      {switching ? (
        <div className="session-switch-veil" data-testid="session-switching" role="status" aria-live="polite">
          <span className="session-switch-pulse" aria-hidden="true" />
          <span className="sr-only">Opening session…</span>
        </div>
      ) : null}
    </section>
  );
}
