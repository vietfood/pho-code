import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CornerDownLeftIcon, FileIcon, FolderIcon, ListPlusIcon, SquareIcon, WaypointsIcon, XIcon } from "lucide-react";
import type {
  AgentBackendDescriptor,
  ContextUsageSummary,
  ModelSummary,
  PathSuggestion,
  PreparedImageSummary,
  SearchWorkspaceReferencesResult,
  SessionQueueState,
  SessionUsageSummary,
  SkillInventoryEntry,
  SkillSettingsSnapshot,
  ThinkingLevel,
  WorkspaceReferenceKind,
  SessionAgentMode,
} from "@pho-code/protocol";
import { availableSlashSkills, SKILL_SOURCE_LABELS, skillNeedsCompatibilityNotice } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { findAtQuery, insertAtMention, mentionDirectory, mentionLabel } from "./lib/at-mention";
import { composerHighlight } from "./lib/composer-highlight";
import { insertSkillToken } from "./lib/composer-tokens";
import {
  clampComposerMenuIndex,
  isDismissedComposerToken,
  nextComposerMenuIndex,
  shouldSkipComposerTokenSyncOnKeyUp,
} from "./lib/composer-menu-keys";
import { findSlashQuery } from "./lib/slash-query";
import {
  clipboardLooksLikeImage,
  collectPastedImageFiles,
  pasteFingerprint,
  shouldIgnoreDuplicatePaste,
} from "./lib/clipboard-images";
import {
  composerNeedsChipRender,
  getComposerCaretOffset,
  getComposerSelectionOffsets,
  insertComposerPlainText,
  normalizePastedPlainText,
  renderComposerValue,
  scrollComposerCaretIntoView,
  serializeComposerEditable,
  setComposerCaretOffset,
} from "./lib/composer-editable-dom";
import { ComposerContextButton } from "./composer-context-button";
import { BackendPicker } from "./backend-picker";
import { ComposerRail } from "./composer-rail";
import { ComposerToolbar } from "./composer-toolbar";
import { isMaxThinkingLevel } from "./lib/thinking-labels";
import { ThinkingLevelChip } from "./thinking-level-chip";
import { FastModeChip } from "./fast-mode-chip";
import { MarkdownImage } from "./markdown-image";
import { ModelPicker } from "./model-picker";
import { ComposerPickerMenu } from "./composer-picker-menu";
import { SkillCompatibilityDialog } from "./skill-compatibility-dialog";
import { SkillSourceIcon } from "./skill-source-icon";

// Docked composer chrome adapted from refs/t3code ChatView composer dock and
// ComposerPrimaryActions.tsx (MIT, T3 Tools Inc., 6bc6cb6). In-field model/thinking
// controls and empty-session hero layout are harness-owned Cursor-inspired chrome.
// Highlight ring, gliding @ / picker, and / skill insert adapted from Beautiful UI
// PromptBar.tsx (MIT, Shane Levine, retrieved 2026-08-13 / 2026-08-22): omitted
// dictation, glimm sweep, autoplay, and fake source/command catalogs.
// Image attach is Milestone 1 Slice 4.
// Usage strip inspired by Pi TUI footer / AI Elements Context (bar, not ring).
// @ mention chips are Cursor-inspired (visual reference only; harness-owned).
// Layout is Claude Code-inspired (visual reference only; harness-owned): a context
// chip rail above the field, a prompt-only field with an inline send affordance,
// and a flat mode/model/usage toolbar under it.

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  running,
  models,
  selectedModel,
  thinkingLevel,
  availableThinkingLevels,
  supportsThinking,
  fastMode,
  selectorsDisabled,
  onModelChange,
  onThinkingChange,
  onFastModeChange,
  agentBackends = [],
  backendId = "pi",
  onBackendChange,
  sessionMode = "agent",
  onSessionModeChange,
  metaHint,
  usage,
  contextUsage,
  onSearchReferences,
  variant = "docked",
  images = [],
  queue,
  onSteer,
  onFollowUp,
  onPickImages,
  onPasteImages,
  onRemoveImage,
  skills,
  inputId = "composer-input",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  disabled: boolean;
  running: boolean;
  models: readonly ModelSummary[];
  selectedModel?: ModelSummary;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: readonly ThinkingLevel[];
  supportsThinking: boolean;
  fastMode?: { enabled: boolean; description?: string };
  selectorsDisabled: boolean;
  onModelChange: (model: ModelSummary) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
  onFastModeChange?: (enabled: boolean) => void;
  agentBackends?: readonly AgentBackendDescriptor[];
  backendId?: string;
  onBackendChange?: (backendId: string) => void;
  sessionMode?: SessionAgentMode;
  onSessionModeChange?: (mode: SessionAgentMode) => void;
  metaHint?: string;
  usage?: SessionUsageSummary;
  contextUsage?: ContextUsageSummary;
  onSearchReferences?: (query: string) => Promise<SearchWorkspaceReferencesResult>;
  variant?: "docked" | "hero";
  images?: readonly PreparedImageSummary[];
  queue?: SessionQueueState;
  onSteer?: () => void;
  onFollowUp?: () => void;
  onPickImages?: () => void;
  onPasteImages?: (files: readonly File[]) => void;
  onRemoveImage?: (imageId: string) => void;
  skills?: SkillSettingsSnapshot;
  /** Editable field id; scoped per chat tile so focus helpers cannot collide. */
  inputId?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const kindsRef = useRef(new Map<string, WorkspaceReferenceKind>());
  const requestRef = useRef(0);
  const pendingCaretRef = useRef<number | null>(null);
  const lastImagePasteRef = useRef<{ fingerprint: string; at: number } | null>(null);
  const showThinking = supportsThinking || availableThinkingLevels.length > 1;
  const hero = variant === "hero";
  const mentionSessionRef = useRef<{ start: number } | null>(null);
  const dismissedMentionStartRef = useRef<number | null>(null);
  const dismissedSlashStartRef = useRef<number | null>(null);
  const previousSlashQueryRef = useRef<string | null>(null);
  const mentionOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const skillOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionRaw, setMentionRaw] = useState("");
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashStart, setSlashStart] = useState(0);
  const [skillChoices, setSkillChoices] = useState<SkillInventoryEntry[]>([]);
  const [pendingSkill, setPendingSkill] = useState<{
    entry: SkillInventoryEntry;
    slashStart: number;
    slashQuery: string;
    cursor: number;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const canSend = value.trim() !== "" || images.length > 0;
  const menuOpen = mentionQuery !== null && Boolean(onSearchReferences);
  const slashOpen = slashQuery !== null;
  const maxThinking = isMaxThinkingLevel(thinkingLevel, availableThinkingLevels);
  const highlight = composerHighlight({
    mentionOpen: mentionQuery !== null,
    slashOpen,
    maxThinking,
  });
  const fieldDisabled = disabled && !running;
  const supportsImages = selectedModel?.supportsImages === true;
  const canAttach = Boolean(onPickImages) && supportsImages && images.length < 5;
  const placeholder = running ? "Steer or add a follow-up…" : hero ? "Ask anything" : "Send follow-up";

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const skip =
      mentionQuery !== null
        ? { start: mentionStart, end: mentionStart + 1 + mentionRaw.length }
        : slashQuery !== null
          ? { start: slashStart, end: slashStart + 1 + slashQuery.length }
          : undefined;
    const serialized = serializeComposerEditable(editor);
    if (serialized !== value || composerNeedsChipRender(editor, value, skip)) {
      const hadFocus = editor === editor.ownerDocument.activeElement;
      const caret = pendingCaretRef.current ?? (hadFocus ? getComposerCaretOffset(editor) : value.length);
      pendingCaretRef.current = null;
      renderComposerValue(editor, value, kindsRef.current, editor.ownerDocument, skip);
      if (hadFocus || caret !== value.length) {
        setComposerCaretOffset(editor, caret);
      }
      scrollComposerCaretIntoView(editor);
    }
  }, [value, mentionQuery, mentionStart, mentionRaw, slashQuery, slashStart]);

  useEffect(() => {
    if (!onSearchReferences || mentionQuery === null) {
      setSuggestions([]);
      setSearchStatus(null);
      return;
    }
    const handle = window.setTimeout(() => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      void onSearchReferences(mentionQuery)
        .then((result) => {
          if (requestRef.current !== requestId) {
            return;
          }
          setSuggestions(result.suggestions);
          setActiveIndex(0);
          setSearchStatus(result.diagnostic ?? (result.status === "indexing" ? "Indexing workspace…" : null));
        })
        .catch((error: unknown) => {
          if (requestRef.current !== requestId) {
            return;
          }
          setSuggestions([]);
          setSearchStatus(error instanceof Error ? error.message : "Search failed.");
        });
    }, 120);
    return () => window.clearTimeout(handle);
  }, [mentionQuery, onSearchReferences]);

  useEffect(() => {
    if (slashQuery === null) {
      setSkillChoices([]);
      previousSlashQueryRef.current = null;
      return;
    }
    const next = skills ? availableSlashSkills(skills, slashQuery) : [];
    setSkillChoices(next);
    if (previousSlashQueryRef.current !== slashQuery) {
      setActiveIndex(0);
      previousSlashQueryRef.current = slashQuery;
    }
  }, [slashQuery, skills]);

  useEffect(() => {
    mentionOptionRefs.current.length = suggestions.length;
  }, [suggestions.length]);

  useEffect(() => {
    skillOptionRefs.current.length = skillChoices.length;
  }, [skillChoices.length]);

  useEffect(() => {
    if (menuOpen && suggestions.length > 0) {
      setActiveIndex((index) => clampComposerMenuIndex(index, suggestions.length));
      return;
    }
    if (slashOpen && skillChoices.length > 0) {
      setActiveIndex((index) => clampComposerMenuIndex(index, skillChoices.length));
    }
  }, [menuOpen, slashOpen, skillChoices.length, suggestions.length]);

  useLayoutEffect(() => {
    if (menuOpen) {
      mentionOptionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (slashOpen) {
      skillOptionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeIndex, menuOpen, slashOpen, skillChoices.length, suggestions.length]);

  function closeMention(): void {
    mentionSessionRef.current = null;
    setMentionQuery(null);
    setMentionRaw("");
    setSuggestions([]);
    setSearchStatus(null);
  }

  function dismissMention(): void {
    dismissedMentionStartRef.current = mentionSessionRef.current?.start ?? mentionStart;
    closeMention();
  }

  function closeSlash(): void {
    setSlashQuery(null);
    setSkillChoices([]);
  }

  function dismissSlash(): void {
    dismissedSlashStartRef.current = slashQuery !== null ? slashStart : null;
    closeSlash();
  }

  function closeComposerMenus(): void {
    closeMention();
    closeSlash();
  }

  function syncComposerTokensFromEditor(): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const next = serializeComposerEditable(editor);
    const cursor = getComposerCaretOffset(editor);
    const mention = findAtQuery(next, cursor, mentionSessionRef.current?.start ?? null);
    if (mention) {
      if (isDismissedComposerToken(mention.start, dismissedMentionStartRef.current)) {
        closeSlash();
        return;
      }
      dismissedMentionStartRef.current = null;
      closeSlash();
      mentionSessionRef.current = { start: mention.start };
      setMentionStart(mention.start);
      setMentionQuery(mention.query);
      setMentionRaw(mention.raw);
      return;
    }
    closeMention();
    const slash = findSlashQuery(next, cursor);
    if (slash) {
      if (isDismissedComposerToken(slash.start, dismissedSlashStartRef.current)) {
        return;
      }
      dismissedSlashStartRef.current = null;
      setSlashStart(slash.start);
      setSlashQuery(slash.query);
      return;
    }
    closeSlash();
  }

  function handleEditorInput(): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    dismissedMentionStartRef.current = null;
    dismissedSlashStartRef.current = null;
    const next = serializeComposerEditable(editor);
    onChange(next);
    syncComposerTokensFromEditor();
  }

  function focusEditorAt(cursor: number): void {
    requestAnimationFrame(() => {
      const field = editorRef.current;
      if (!field) {
        return;
      }
      field.focus();
      setComposerCaretOffset(field, cursor);
      syncComposerTokensFromEditor();
    });
  }

  function selectSuggestion(suggestion: PathSuggestion): void {
    const editor = editorRef.current;
    const cursor = editor ? getComposerCaretOffset(editor) : value.length;
    const next = insertAtMention(
      value,
      { start: mentionStart, query: mentionQuery ?? "", raw: mentionRaw },
      cursor,
      suggestion.path,
    );
    kindsRef.current.set(suggestion.path, suggestion.kind);
    pendingCaretRef.current = next.cursor;
    onChange(next.text);
    dismissMention();
    focusEditorAt(next.cursor);
  }

  function insertSelectedSkill(entry: SkillInventoryEntry, slash: { start: number; query: string }, cursor: number): void {
    const next = insertSkillToken(value, slash, cursor, entry.sourceId, entry.skillName);
    pendingCaretRef.current = next.cursor;
    onChange(next.text);
    dismissSlash();
    focusEditorAt(next.cursor);
  }

  function selectSkill(entry: SkillInventoryEntry): void {
    const editor = editorRef.current;
    const cursor = editor ? getComposerCaretOffset(editor) : value.length;
    const slash = { start: slashStart, query: slashQuery ?? "" };
    if (skillNeedsCompatibilityNotice(entry.compatibility)) {
      setPendingSkill({ entry, slashStart: slash.start, slashQuery: slash.query, cursor });
      return;
    }
    insertSelectedSkill(entry, slash, cursor);
  }

  const attachTitle = supportsImages
    ? "Attach PNG, JPEG, GIF, or WebP images"
    : "The selected model does not accept images";

  const mode = (
    <ComposerContextButton
      mode={sessionMode}
      disabled={selectorsDisabled}
      {...(onSessionModeChange ? { onModeChange: onSessionModeChange } : {})}
      {...(onPickImages ? { onAttach: onPickImages } : {})}
      attachDisabled={disabled || !canAttach}
      attachTitle={attachTitle}
    />
  );

  const backend = onBackendChange ? (
    <BackendPicker
      backends={agentBackends}
      selectedBackendId={backendId}
      disabled={selectorsDisabled}
      onBackendChange={onBackendChange}
    />
  ) : null;

  const selectors = (
    <>
      <label className="sr-only" htmlFor="model-selector">
        Model
      </label>
      <ModelPicker
        models={models}
        disabled={selectorsDisabled || models.length === 0}
        onModelChange={onModelChange}
        {...(selectedModel ? { selectedModel } : {})}
      />
      {showThinking ? (
        <ThinkingLevelChip
          level={thinkingLevel}
          availableLevels={availableThinkingLevels}
          disabled={selectorsDisabled}
          onChange={onThinkingChange}
        />
      ) : null}
      {fastMode && onFastModeChange ? (
        <FastModeChip
          enabled={fastMode.enabled}
          disabled={selectorsDisabled}
          {...(fastMode.description ? { description: fastMode.description } : {})}
          onChange={onFastModeChange}
        />
      ) : null}
    </>
  );

  const queueActions = [
    {
      id: "steer",
      label: "Steer",
      ariaLabel: "Steer current run",
      title: "Steer current run — changes the next model step after current tools",
      icon: WaypointsIcon,
      action: onSteer,
    },
    {
      id: "follow-up",
      label: "Follow-up",
      ariaLabel: "Add follow-up",
      title: "Add follow-up — waits until the agent becomes idle",
      icon: ListPlusIcon,
      action: onFollowUp,
    },
  ];

  // Steering and follow-up stay text actions, so they sit in the toolbar beside the
  // mode chip; the field keeps a single primary affordance (send, or stop while a
  // run is live).
  const queueControls = running ? (
    <>
      {queueActions.map(({ id, label, ariaLabel, title, icon: Icon, action }) => (
        <button
          key={id}
          type="button"
          className="composer-queue-action"
          data-testid={`${id}-button`}
          aria-label={ariaLabel}
          title={title}
          disabled={disabled || !canSend}
          onClick={() => {
            if (!disabled && canSend) {
              closeComposerMenus();
              action?.();
            }
          }}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </>
  ) : null;

  const submit = running ? (
    <button
      type="button"
      className="composer-send is-stop"
      data-testid="stop-button"
      aria-label="Stop"
      title="Stop the current run"
      onClick={onStop}
    >
      <SquareIcon className="size-3 fill-current" aria-hidden="true" />
    </button>
  ) : (
    <button
      type="submit"
      className={cn("composer-send", canSend && !disabled && "is-ready")}
      data-testid="send-button"
      disabled={disabled || !canSend}
      aria-label="Send"
      title="Send — Enter"
    >
      <CornerDownLeftIcon className="size-3.5 stroke-[2]" aria-hidden="true" />
    </button>
  );

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        if (!running && canSend) {
          closeComposerMenus();
          onSubmit();
        }
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        Message
      </label>
      {queue && (queue.steering.length > 0 || queue.followUp.length > 0) ? (
        <div className="composer-queue" data-testid="composer-queue">
          {[
            ...queue.steering.map((item, index) => ({ key: `steer:${index}`, className: "is-steer", label: "Steer", text: item.text })),
            ...queue.followUp.map((item, index) => ({ key: `follow:${index}`, className: "is-follow-up", label: "Follow-up", text: item.text })),
          ].map((chip) => (
            <span key={chip.key} className={cn("composer-queue-chip", chip.className)}>
              {chip.label} · {chip.text || "Image"}
            </span>
          ))}
        </div>
      ) : null}
      {/* A model that cannot accept images gets no rail affordance at all; the mode
          menu still carries the disabled Images… entry with the reason. */}
      <ComposerRail
        showContextChips={hero}
        {...(metaHint ? { workspaceName: metaHint } : {})}
        {...(onPickImages && supportsImages ? { onAttach: onPickImages } : {})}
        attachDisabled={disabled || !canAttach}
        attachTitle={attachTitle}
      />
      <div
        className={cn("chat-composer-shell", highlight !== "none" && `is-${highlight}`)}
        data-composer-highlight={highlight}
      >
        {menuOpen ? (
          <ComposerPickerMenu
            label="Workspace references"
            testId="composer-mentions"
            hint="Type to search files and folders"
            activeIndex={activeIndex}
            itemCount={suggestions.length}
            listKey={mentionQuery ?? ""}
          >
            {suggestions.length === 0 ? (
              <div className="composer-mention-empty">{searchStatus ?? "No matching files"}</div>
            ) : (
              suggestions.map((suggestion, index) => {
                const directory = mentionDirectory(suggestion.path);
                return (
                  <button
                    key={`${suggestion.kind}:${suggestion.path}`}
                    ref={(node) => {
                      mentionOptionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn("composer-mention-option", index === activeIndex && "is-active")}
                    title={suggestion.path}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectSuggestion(suggestion);
                    }}
                  >
                    <span className="composer-mention-option-icon">
                      {suggestion.kind === "folder" ? (
                        <FolderIcon className="size-3.5" aria-hidden="true" />
                      ) : (
                        <FileIcon className="size-3.5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="composer-mention-option-text">
                      <span className="composer-mention-option-name">{mentionLabel(suggestion.path)}</span>
                      {directory ? <span className="composer-mention-option-dir">{directory}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </ComposerPickerMenu>
        ) : null}
        {slashOpen ? (
          <ComposerPickerMenu
            label="Skills"
            testId="composer-skills"
            hint="Type to search skills"
            activeIndex={activeIndex}
            itemCount={skillChoices.length}
            listKey={slashQuery ?? ""}
          >
            {skillChoices.length === 0 ? (
              <div className="composer-mention-empty">
                {skills
                  ? "No matching skills. Enable a source in Settings to make its skills available here."
                  : "Skills are not loaded yet."}
              </div>
            ) : (
              skillChoices.map((entry, index) => (
                <button
                  key={`${entry.sourceId}:${entry.skillName}`}
                  ref={(node) => {
                    skillOptionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn("composer-mention-option", index === activeIndex && "is-active")}
                  title={entry.description ?? entry.displayName}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setActiveIndex(index);
                    selectSkill(entry);
                  }}
                >
                  <span className="composer-mention-option-icon">
                    <SkillSourceIcon sourceId={entry.sourceId} className="size-3.5" />
                  </span>
                  <span className="composer-mention-option-text">
                    <span className="composer-mention-option-name">{entry.displayName}</span>
                    <span className="composer-mention-option-dir">
                      {SKILL_SOURCE_LABELS[entry.sourceId]}
                      {entry.compatibility === "compatible" ? "" : ` · ${entry.compatibility}`}
                    </span>
                  </span>
                </button>
              ))
            )}
          </ComposerPickerMenu>
        ) : null}
        <div className={cn("chat-composer-host", hero ? "px-4 py-3" : "px-4 py-2.5")}>
          <div className="relative z-10 flex flex-col">
            {images.length > 0 ? (
              <div className="composer-image-row" data-testid="composer-images">
                {images.map((image) => (
                  <div key={image.id} className="composer-image-thumb" data-testid="prepared-image">
                    <MarkdownImage src={image.previewDataUrl} alt={image.name} />
                    <button
                      type="button"
                      className="composer-image-remove"
                      aria-label={`Remove ${image.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemoveImage?.(image.id);
                      }}
                    >
                      <XIcon className="size-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="composer-field">
              <div
                ref={editorRef}
                id={inputId}
                data-testid="composer"
                role="textbox"
                aria-multiline="true"
                aria-label="Message"
                aria-disabled={fieldDisabled || undefined}
                contentEditable={!fieldDisabled}
                suppressContentEditableWarning
                data-placeholder={placeholder}
                className={cn(
                  "chat-composer-input chat-composer-editable min-w-0 w-full overflow-x-hidden overflow-y-auto bg-transparent text-foreground outline-none",
                  fieldDisabled && "opacity-60",
                  hero ? "max-h-[min(52em,70vh)] min-h-[1.5em]" : "max-h-[min(48em,58vh)] min-h-[1.5em]",
                )}
                onInput={handleEditorInput}
                onKeyUp={(event) => {
                  if (shouldSkipComposerTokenSyncOnKeyUp(event.key, menuOpen, slashOpen)) {
                    return;
                  }
                  syncComposerTokensFromEditor();
                }}
                onClick={syncComposerTokensFromEditor}
                onPaste={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (fieldDisabled) {
                    return;
                  }
                  const imageFiles = collectPastedImageFiles({
                    files: event.clipboardData?.files,
                    items: event.clipboardData?.items,
                  });
                  if (
                    onPasteImages &&
                    (imageFiles.length > 0 || clipboardLooksLikeImage(event.clipboardData?.types))
                  ) {
                    const fingerprint = pasteFingerprint(imageFiles, event.clipboardData?.types);
                    const now = Date.now();
                    if (shouldIgnoreDuplicatePaste(lastImagePasteRef.current, fingerprint, now)) {
                      return;
                    }
                    lastImagePasteRef.current = { fingerprint, at: now };
                    onPasteImages(imageFiles);
                    return;
                  }
                  const pasted = normalizePastedPlainText(event.clipboardData?.getData("text/plain") ?? "");
                  if (pasted === "") {
                    return;
                  }
                  const editor = editorRef.current;
                  if (!editor) {
                    return;
                  }
                  const next = insertComposerPlainText(value, getComposerSelectionOffsets(editor), pasted);
                  pendingCaretRef.current = next.cursor;
                  closeComposerMenus();
                  onChange(next.text);
                }}
                onKeyDown={(event) => {
                  // Returns true when the key was consumed by the open menu. Enter
                  // with no selection dismisses the menu and falls through to submit.
                  const menuKeys = <T,>(
                    open: boolean,
                    items: readonly T[],
                    select: (item: T) => void,
                    dismiss: () => void,
                  ): boolean => {
                    if (!open) {
                      return false;
                    }
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      if (items.length > 0) {
                        setActiveIndex((index) =>
                          nextComposerMenuIndex(index, event.key === "ArrowDown" ? 1 : -1, items.length),
                        );
                      }
                      return true;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      const selected = items[activeIndex];
                      if (selected) {
                        event.preventDefault();
                        select(selected);
                        return true;
                      }
                      dismiss();
                      if (event.key === "Tab") {
                        event.preventDefault();
                        return true;
                      }
                    }
                    return false;
                  };
                  if (menuKeys(slashOpen, skillChoices, selectSkill, dismissSlash)) {
                    return;
                  }
                  if (menuKeys(menuOpen, suggestions, selectSuggestion, dismissMention)) {
                    return;
                  }
                  if (event.key === "Escape" && (menuOpen || slashOpen)) {
                    event.preventDefault();
                    if (menuOpen) {
                      dismissMention();
                    }
                    if (slashOpen) {
                      dismissSlash();
                    }
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!running && !disabled && canSend) {
                      closeComposerMenus();
                      onSubmit();
                    }
                  }
                }}
              />
              {submit}
            </div>
          </div>
        </div>
      </div>
      <ComposerToolbar
        leading={
          <>
            {backend}
            {mode}
            {queueControls}
          </>
        }
        trailing={selectors}
        {...(usage ? { usage } : {})}
        {...(contextUsage ? { contextUsage } : {})}
      />
      {pendingSkill ? (
        <SkillCompatibilityDialog
          title={
            pendingSkill.entry.compatibility === "incompatible"
              ? "This skill isn't compatible"
              : "This skill isn't fully compatible"
          }
          message={
            pendingSkill.entry.compatibility === "incompatible"
              ? `${pendingSkill.entry.displayName} ${pendingSkill.entry.reason ?? "cannot be loaded as Markdown."} You can still insert a reference; Pho Code may not load its instructions.`
              : `${pendingSkill.entry.displayName} includes scripts or other assets. Pho Code can insert the Markdown instructions only. Scripts and executables will not run.`
          }
          confirmLabel="Insert anyway"
          onCancel={() => setPendingSkill(null)}
          onConfirm={() => {
            const pending = pendingSkill;
            setPendingSkill(null);
            insertSelectedSkill(
              pending.entry,
              { start: pending.slashStart, query: pending.slashQuery },
              pending.cursor,
            );
          }}
        />
      ) : null}
    </form>
  );
}
