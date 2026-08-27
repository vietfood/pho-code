import { useEffect, useState, type ReactNode } from "react";
import type {
  AgentBackendDescriptor,
  ChangeScope,
  HostDialogRequest,
  ModelSummary,
  PreparedImageSummary,
  ResolveHostDialogInput,
  SearchWorkspaceReferencesResult,
  SessionSnapshot,
  SkillSettingsSnapshot,
  ThinkingLevel,
  SessionAgentMode,
} from "@pho-code/protocol";
import { ChangeModelDialog } from "./change-model-dialog";
import { CursorModelWarningDialog } from "./cursor-model-warning-dialog";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { EmptySessionStage } from "./empty-session";
import { HostDialog } from "./host-dialog";
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
  onFastModeChange,
  agentBackends,
  backendId,
  onBackendChange,
  onSessionModeChange,
  dialog,
  onResolveDialog,
  yoloMode,
  sidebarCollapsed,
  paneFill = false,
  headerActions,
  onToggleSidebar,
  onSearchReferences,
  images,
  onSteer,
  onFollowUp,
  onPickImages,
  onPasteImages,
  onRemoveImage,
  onRewrite,
  onOpenChangeReview,
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
  onFastModeChange?: (enabled: boolean) => void;
  agentBackends?: readonly AgentBackendDescriptor[];
  backendId?: string;
  onBackendChange?: (backendId: string) => void;
  onSessionModeChange?: (mode: SessionAgentMode) => void;
  dialog?: HostDialogRequest | null;
  onResolveDialog?: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
  yoloMode?: boolean;
  sidebarCollapsed?: boolean;
  paneFill?: boolean;
  headerActions?: ReactNode;
  onToggleSidebar?: () => void;
  onSearchReferences?: (query: string) => Promise<SearchWorkspaceReferencesResult>;
  images?: readonly PreparedImageSummary[];
  onSteer?: () => void;
  onFollowUp?: () => void;
  onPickImages?: () => void;
  onPasteImages?: (files: readonly File[]) => void;
  onRemoveImage?: (imageId: string) => void;
  onRewrite?: (input: { messageId: string; text: string }) => void | Promise<void>;
  onOpenChangeReview?: (scope: ChangeScope) => void;
  notice?: ReactNode;
  onTrustProject?: () => void;
  skills?: SkillSettingsSnapshot;
}) {
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
  const empty = isEmptyConversation(snapshot);
  const [pendingModel, setPendingModel] = useState<ModelSummary | null>(null);

  useEffect(() => {
    if (!empty || dialog || pendingModel) {
      return;
    }
    document.getElementById("composer-input")?.focus();
  }, [dialog, empty, pendingModel]);

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
      disabled={!snapshot.model && Boolean(snapshot.modelError)}
      running={running}
      models={snapshot.models}
      thinkingLevel={snapshot.thinkingLevel}
      availableThinkingLevels={snapshot.availableThinkingLevels}
      supportsThinking={snapshot.supportsThinking}
      {...(snapshot.fastMode ? { fastMode: snapshot.fastMode } : {})}
      selectorsDisabled={running}
      onModelChange={requestModelChange}
      onThinkingChange={onThinkingChange}
      {...(onFastModeChange ? { onFastModeChange } : {})}
      {...(agentBackends ? { agentBackends } : {})}
      {...(backendId ? { backendId } : {})}
      {...(onBackendChange ? { onBackendChange } : {})}
      sessionMode={snapshot.plan?.mode ?? "agent"}
      {...(onSessionModeChange ? { onSessionModeChange } : {})}
      variant={empty ? "hero" : "docked"}
      metaHint={snapshot.workspace.displayName}
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
    dialog && onResolveDialog ? <HostDialog request={dialog} onResolve={onResolveDialog} /> : null;
  const changeModelDialog =
    pendingModel ? (
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
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Conversation"
      {...(paneFill ? { "data-chat-fill": "true" } : {})}
    >
      <div className="session-pane-body flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatHeader
          title={snapshot.session.title}
          paneFill={paneFill}
          {...(snapshot.modelError ? { modelError: snapshot.modelError } : {})}
          {...(yoloMode ? { yoloMode: true } : {})}
          {...(sidebarCollapsed ? { sidebarCollapsed: true } : {})}
          {...(headerActions ? { headerActions } : {})}
          {...(onToggleSidebar ? { onToggleSidebar } : {})}
          {...(onTrustProject ? { onTrustProject } : {})}
        />
        {notice}
        {empty ? (
          <EmptySessionStage
            workspaceName={snapshot.workspace.displayName}
            leftOverlay={Boolean(sidebarCollapsed && !paneFill)}
            rightOverlay={!paneFill}
          >
            {hostDialog}
            {composer}
          </EmptySessionStage>
        ) : (
          <>
            <Transcript
              key={`${snapshot.workspace.id}:${snapshot.session.id}`}
              snapshot={snapshot}
              {...(onRewrite ? { onRewrite } : {})}
              {...(onOpenChangeReview ? { onOpenChangeReview } : {})}
            />
            <div className="chat-composer-horizontal-inset pointer-events-none shrink-0 pt-1 pb-2.5 sm:pt-1.5 sm:pb-3">
              <div className="chat-column pointer-events-auto">
                {hostDialog}
                {composer}
              </div>
            </div>
          </>
        )}
      </div>
      {changeModelDialog}
    </section>
  );
}
