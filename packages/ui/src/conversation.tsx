import { useEffect, useState, type ReactNode } from "react";
import type {
  HostDialogRequest,
  ModelSummary,
  PreparedImageSummary,
  ResolveHostDialogInput,
  SearchWorkspaceReferencesResult,
  SessionSnapshot,
  SkillSettingsSnapshot,
  ThinkingLevel,
} from "@pho-code/protocol";
import { ChangeModelDialog } from "./change-model-dialog";
import { CursorModelWarningDialog } from "./cursor-model-warning-dialog";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { EmptySessionStage } from "./empty-session";
import { HostDialog } from "./host-dialog";
import { cn } from "./lib/cn";
import { isEmptyConversation } from "./lib/empty-conversation";
import { sameModel } from "./lib/model-identity";
import { Transcript } from "./transcript";

const CURSOR_PROVIDER_ID = "cursor";

function isCursorModel(model: ModelSummary): boolean {
  return model.provider.trim().toLowerCase() === CURSOR_PROVIDER_ID;
}

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
  notice,
  onTrustProject,
  skills,
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
  notice?: ReactNode;
  onTrustProject?: () => void;
  skills?: SkillSettingsSnapshot;
}) {
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
  const empty = isEmptyConversation(snapshot);
  const [pendingModel, setPendingModel] = useState<ModelSummary | null>(null);

  useEffect(() => {
    if (switching || !empty || dialog || pendingModel) {
      return;
    }
    document.getElementById("composer-input")?.focus();
  }, [dialog, empty, pendingModel, switching]);

  useEffect(() => {
    setPendingModel(null);
  }, [snapshot.session.id, snapshot.workspace.id]);

  function requestModelChange(model: ModelSummary) {
    if (sameModel(model, snapshot.model)) {
      return;
    }
    // Cursor models always warn: nested Cursor agent loop + permission boundary.
    // Non-cursor mid-chat still warns about cache/context.
    if (isCursorModel(model) || !empty) {
      setPendingModel(model);
      return;
    }
    onModelChange(model);
  }

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
      onModelChange={requestModelChange}
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
      {...(skills ? { skills } : {})}
    />
  );
  const hostDialog =
    !switching && dialog && onResolveDialog ? <HostDialog request={dialog} onResolve={onResolveDialog} /> : null;
  const changeModelDialog =
    !switching && pendingModel ? (
      isCursorModel(pendingModel) ? (
        <CursorModelWarningDialog
          model={pendingModel}
          midChat={!empty}
          {...(snapshot.model ? { currentModel: snapshot.model } : {})}
          {...(snapshot.contextUsage ? { contextUsage: snapshot.contextUsage } : {})}
          onCancel={() => setPendingModel(null)}
          onConfirm={() => {
            const model = pendingModel;
            setPendingModel(null);
            onModelChange(model);
          }}
        />
      ) : (
        <ChangeModelDialog
          model={pendingModel}
          {...(snapshot.model ? { currentModel: snapshot.model } : {})}
          {...(snapshot.contextUsage ? { contextUsage: snapshot.contextUsage } : {})}
          onCancel={() => setPendingModel(null)}
          onConfirm={() => {
            const model = pendingModel;
            setPendingModel(null);
            onModelChange(model);
          }}
        />
      )
    ) : null;

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
          {...(onTrustProject ? { onTrustProject } : {})}
        />
        {notice}
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
      {changeModelDialog}
      {switching ? (
        <div className="session-switch-veil" data-testid="session-switching" role="status" aria-live="polite">
          <span className="session-switch-pulse" aria-hidden="true" />
          <span className="sr-only">Opening session…</span>
        </div>
      ) : null}
    </section>
  );
}
