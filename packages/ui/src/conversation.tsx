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
import { emptySessionContextPrompt } from "@pho-code/protocol";
import { ChangeModelDialog } from "./change-model-dialog";
import { ContextPromptDialog } from "./context-prompt-dialog";
import { CursorModelWarningDialog } from "./cursor-model-warning-dialog";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { EmptySessionStage } from "./empty-session";
import { HostDialog } from "./host-dialog";
import { isEmptyConversation } from "./lib/empty-conversation";
import { sameModel } from "./lib/model-identity";
import { Transcript } from "./transcript";

const CURSOR_PROVIDER_ID = "cursor";
const fallbackContextPrompt = emptySessionContextPrompt();

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
  onUpdateContextPrompt,
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
  onUpdateContextPrompt?: (input: { preamble: string; disabledSectionIds: string[]; reset?: boolean }) => void | Promise<void>;
  notice?: ReactNode;
  onTrustProject?: () => void;
  skills?: SkillSettingsSnapshot;
}) {
  const running = snapshot.run.status === "admitted" || snapshot.run.status === "streaming";
  const empty = isEmptyConversation(snapshot);
  const contextPrompt = snapshot.contextPrompt ?? fallbackContextPrompt;
  const [pendingModel, setPendingModel] = useState<ModelSummary | null>(null);
  const [contextPromptOpen, setContextPromptOpen] = useState(false);
  const [contextPromptBusy, setContextPromptBusy] = useState(false);

  useEffect(() => {
    if (!empty || dialog || pendingModel || contextPromptOpen) {
      return;
    }
    document.getElementById("composer-input")?.focus();
  }, [contextPromptOpen, dialog, empty, pendingModel]);

  useEffect(() => {
    setPendingModel(null);
    setContextPromptOpen(false);
    setContextPromptBusy(false);
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
      selectorsDisabled={running}
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
  const contextPromptDialog = contextPromptOpen ? (
    <ContextPromptDialog
      contextPrompt={contextPrompt}
      busy={contextPromptBusy}
      onClose={() => {
        if (!contextPromptBusy) {
          setContextPromptOpen(false);
        }
      }}
      {...(onUpdateContextPrompt
        ? {
            onSave: async (input: { preamble: string; disabledSectionIds: string[] }) => {
              setContextPromptBusy(true);
              try {
                await onUpdateContextPrompt(input);
              } finally {
                setContextPromptBusy(false);
              }
            },
            onReset: async () => {
              setContextPromptBusy(true);
              try {
                await onUpdateContextPrompt({
                  preamble: contextPrompt.defaultPreamble,
                  disabledSectionIds: [],
                  reset: true,
                });
              } finally {
                setContextPromptBusy(false);
              }
            },
          }
        : {})}
    />
  ) : null;

  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Conversation"
    >
      <div className="session-pane-body flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatHeader
          {...(snapshot.modelError ? { modelError: snapshot.modelError } : {})}
          {...(yoloMode ? { yoloMode: true } : {})}
          {...(sidebarCollapsed ? { sidebarCollapsed: true } : {})}
          {...(onToggleSidebar ? { onToggleSidebar } : {})}
          {...(onTrustProject ? { onTrustProject } : {})}
          onOpenContextPrompt={() => setContextPromptOpen(true)}
          {...(contextPrompt.customized ? { contextPromptCustomized: true } : {})}
        />
        {notice}
        {empty ? (
          <EmptySessionStage workspaceName={snapshot.workspace.displayName}>
            {hostDialog}
            {composer}
          </EmptySessionStage>
        ) : (
          <>
            <Transcript
              key={`${snapshot.workspace.id}:${snapshot.session.id}`}
              snapshot={snapshot}
              {...(onRewrite ? { onRewrite } : {})}
            />
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
      {contextPromptDialog}
    </section>
  );
}
