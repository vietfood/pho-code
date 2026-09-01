import { useEffect, useState, type ReactNode } from "react";
import type {
  AgentBackendDescriptor,
  ChangeScope,
  CompactionDetail,
  HostDialogRequest,
  ModelSummary,
  PreparedImageSummary,
  ResolveHostDialogInput,
  SearchWorkspaceReferencesResult,
  SessionSnapshot,
  SkillSettingsSnapshot,
  ThinkingLevel,
  SessionAgentMode,
  ApprovalMode,
  ApprovalRequest,
  ApprovalRequestResolution,
} from "@pho-code/protocol";
import { COMPACTION_COPY } from "@pho-code/protocol";
import { ChangeModelDialog } from "./change-model-dialog";
import { CursorModelWarningDialog } from "./cursor-model-warning-dialog";
import { Composer } from "./composer";
import { EmptySessionStage } from "./empty-session";
import { HostDialog } from "./host-dialog";
import { ApprovalRequestCard } from "./approval-request-card";
import { ApprovalReviewActivityView } from "./approval-review-activity";
import { FullAccessWarningDialog } from "./full-access-warning-dialog";
import { setComposerCaretOffset } from "./lib/composer-editable-dom";
import { isPiCursorModel } from "./lib/cursor-model";
import { isEmptyConversation } from "./lib/empty-conversation";
import { sameModel } from "./lib/model-identity";
import { StarterChips } from "./starter-chips";
import { Transcript } from "./transcript";

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
  onApprovalModeChange,
  onRevokeApprovalGrants,
  approvalRequest,
  onResolveApprovalRequest,
  onAuthorizeApprovalRetry,
  dialog,
  onResolveDialog,
  sidebarCollapsed,
  splitActive = false,
  composerInputId,
  onSearchReferences,
  images,
  onSteer,
  onFollowUp,
  onPickImages,
  onPasteImages,
  onRemoveImage,
  onRewrite,
  onOpenChangeReview,
  onCompact,
  onCancelCompaction,
  onReadCompactionDetail,
  notice,
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
  onApprovalModeChange?: (mode: ApprovalMode, acknowledgeFullRisk?: boolean) => void;
  onRevokeApprovalGrants?: () => void;
  approvalRequest?: ApprovalRequest | null;
  onResolveApprovalRequest?: (resolution: ApprovalRequestResolution, reason?: string) => void;
  onAuthorizeApprovalRetry?: (requestId: string) => void;
  dialog?: HostDialogRequest | null;
  onResolveDialog?: (resolution: Omit<ResolveHostDialogInput, "requestId">) => void;
  sidebarCollapsed?: boolean;
  /** Right region visible beside the chat: empty-session overlay pills hide
   *  because their actions live in the region topbar during the split. */
  splitActive?: boolean;
  /** Composer field id, scoped per chat tile so focus helpers cannot collide. */
  composerInputId?: string;
  onSearchReferences?: (query: string) => Promise<SearchWorkspaceReferencesResult>;
  images?: readonly PreparedImageSummary[];
  onSteer?: () => void;
  onFollowUp?: () => void;
  onPickImages?: () => void;
  onPasteImages?: (files: readonly File[]) => void;
  onRemoveImage?: (imageId: string) => void;
  onRewrite?: (input: { messageId: string; text: string }) => void | Promise<void>;
  onOpenChangeReview?: (scope: ChangeScope) => void;
  onCompact?: () => void;
  onCancelCompaction?: () => void;
  onReadCompactionDetail?: (compactionId: string) => Promise<CompactionDetail>;
  notice?: ReactNode;
  skills?: SkillSettingsSnapshot;
}) {
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
  const empty = isEmptyConversation(snapshot);
  const [pendingModel, setPendingModel] = useState<ModelSummary | null>(null);
  const [fullWarningOpen, setFullWarningOpen] = useState(false);

  // Compaction is Pi-owned; other backends publish their own capability and
  // the popover stays silent rather than offering an action that must fail.
  const compactionDisabledReason = running
    ? COMPACTION_COPY.unavailableRunning
    : !snapshot.model
      ? COMPACTION_COPY.unavailableModel
      : undefined;
  const compactionAction =
    backendId === "pi" && onCompact && onCancelCompaction
      ? {
          state: snapshot.compaction,
          ...(snapshot.compaction.status !== "compacting" && compactionDisabledReason !== undefined
            ? { disabledReason: compactionDisabledReason }
            : {}),
          onCompact,
          onCancel: onCancelCompaction,
        }
      : undefined;

  useEffect(() => {
    if (!empty || dialog || pendingModel) {
      return;
    }
    document.getElementById(composerInputId ?? "composer-input")?.focus();
  }, [composerInputId, dialog, empty, pendingModel]);

  useEffect(() => {
    setPendingModel(null);
  }, [snapshot.session.id, snapshot.workspace.id]);

  function handleStarterPrompt(prompt: string) {
    onDraftChange(prompt);
    const inputId = composerInputId ?? "composer-input";
    // Focus after React commits the new draft: the composer's layout effect
    // keeps the click-stolen caret only when the field already has focus, and
    // the caret belongs at the end of the inserted prompt.
    requestAnimationFrame(() => {
      const field = document.getElementById(inputId);
      if (!field) {
        return;
      }
      field.focus();
      setComposerCaretOffset(field, prompt.length);
    });
  }

  function requestModelChange(model: ModelSummary) {
    if (sameModel(model, snapshot.model)) {
      return;
    }
    // Cursor models on the Pi backend always warn: nested Cursor agent loop +
    // permission boundary. Non-cursor mid-chat still warns about cache/context.
    if (isPiCursorModel(model, backendId) || !empty) {
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
      {...(snapshot.approval ? { approval: snapshot.approval } : {})}
      {...(onApprovalModeChange ? {
        onApprovalModeChange: (mode: ApprovalMode) => {
          if (mode === "full" && snapshot.approval?.fullAccess.acknowledgedThisProcess !== true) {
            setFullWarningOpen(true);
            return;
          }
          onApprovalModeChange(mode);
        },
      } : {})}
      {...(onRevokeApprovalGrants ? { onRevokeApprovalGrants } : {})}
      variant={empty ? "hero" : "docked"}
      metaHint={snapshot.workspace.displayName}
      {...(snapshot.model ? { selectedModel: snapshot.model } : {})}
      {...(snapshot.usage ? { usage: snapshot.usage } : {})}
      {...(snapshot.contextUsage ? { contextUsage: snapshot.contextUsage } : {})}
      {...(compactionAction ? { compaction: compactionAction } : {})}
      {...(onSearchReferences ? { onSearchReferences } : {})}
      {...(images ? { images } : {})}
      {...(snapshot.queue ? { queue: snapshot.queue } : {})}
      {...(onSteer ? { onSteer } : {})}
      {...(onFollowUp ? { onFollowUp } : {})}
      {...(onPickImages ? { onPickImages } : {})}
      {...(onPasteImages ? { onPasteImages } : {})}
      {...(onRemoveImage ? { onRemoveImage } : {})}
      {...(skills ? { skills } : {})}
      {...(composerInputId ? { inputId: composerInputId } : {})}
    />
  );
  const hostDialog =
    dialog && onResolveDialog ? <HostDialog request={dialog} onResolve={onResolveDialog} /> : null;
  const approvalDock = approvalRequest && onResolveApprovalRequest
    ? <ApprovalRequestCard request={approvalRequest} onResolve={onResolveApprovalRequest} />
    : null;
  const approvalActivity = (
    <ApprovalReviewActivityView
      activity={snapshot.approval?.activity}
      {...(onAuthorizeApprovalRetry ? { onRetry: onAuthorizeApprovalRetry } : {})}
    />
  );
  const changeModelDialog =
    pendingModel ? (
      isPiCursorModel(pendingModel, backendId) ? (
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
    >
      <div className="session-pane-body flex min-h-0 flex-1 flex-col overflow-hidden">
        {notice}
        {empty ? (
          <EmptySessionStage
            workspaceName={snapshot.workspace.displayName}
            leftOverlay={Boolean(sidebarCollapsed && !splitActive)}
            rightOverlay={!splitActive}
          >
            {hostDialog}
            {approvalDock}
            {approvalActivity}
            {composer}
            <StarterChips onSelect={handleStarterPrompt} />
          </EmptySessionStage>
        ) : (
          <>
            <Transcript
              key={`${snapshot.workspace.id}:${snapshot.session.id}`}
              snapshot={snapshot}
              {...(onRewrite ? { onRewrite } : {})}
              {...(onOpenChangeReview ? { onOpenChangeReview } : {})}
              {...(onReadCompactionDetail ? { onReadCompactionDetail } : {})}
            />
            <div className="chat-composer-horizontal-inset pointer-events-none shrink-0 pt-1 pb-2.5 sm:pt-1.5 sm:pb-3">
              <div className="chat-column pointer-events-auto">
                {hostDialog}
                {approvalDock}
                {approvalActivity}
                {composer}
              </div>
            </div>
          </>
        )}
      </div>
      {changeModelDialog}
      {fullWarningOpen && onApprovalModeChange ? (
        <FullAccessWarningDialog
          onCancel={() => setFullWarningOpen(false)}
          onConfirm={() => {
            setFullWarningOpen(false);
            onApprovalModeChange("full", true);
          }}
        />
      ) : null}
    </section>
  );
}
