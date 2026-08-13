import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  FileIcon,
  FolderIcon,
  ListPlusIcon,
  PaperclipIcon,
  SquareIcon,
  WaypointsIcon,
  XIcon,
} from "lucide-react";
import type {
  ContextUsageSummary,
  ModelSummary,
  PathSuggestion,
  PreparedImageSummary,
  SearchWorkspaceReferencesResult,
  SessionQueueState,
  SessionUsageSummary,
  ThinkingLevel,
  WorkspaceReferenceKind,
} from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { findAtQuery, insertAtMention } from "./lib/at-mention";
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
import { ComposerUsage } from "./composer-usage";
import { isMaxThinkingLevel, thinkingLevelLabel } from "./lib/thinking-labels";
import { MarkdownImage } from "./markdown-image";
import { ModelPicker } from "./model-picker";

// Docked composer chrome adapted from refs/t3code ChatView composer dock and
// ComposerPrimaryActions.tsx (MIT, T3 Tools Inc., 6bc6cb6). In-field model/thinking
// controls and empty-session hero layout are harness-owned Cursor-inspired chrome.
// Slash menus and stash omitted. Image attach is Milestone 1 Slice 4.
// Usage strip inspired by Pi TUI footer / AI Elements Context (bar, not ring).
// @ mention chips are Cursor-inspired (visual reference only; harness-owned).

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
  selectorsDisabled,
  onModelChange,
  onThinkingChange,
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
  selectorsDisabled: boolean;
  onModelChange: (model: ModelSummary) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
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
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const kindsRef = useRef(new Map<string, WorkspaceReferenceKind>());
  const requestRef = useRef(0);
  const pendingCaretRef = useRef<number | null>(null);
  const lastImagePasteRef = useRef<{ fingerprint: string; at: number } | null>(null);
  const showThinking = supportsThinking || availableThinkingLevels.length > 1;
  const hero = variant === "hero";
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const canSend = value.trim() !== "" || images.length > 0;
  const menuOpen = mentionQuery !== null && Boolean(onSearchReferences);
  const fieldDisabled = disabled && !running;
  const supportsImages = selectedModel?.supportsImages === true;
  const canAttach = Boolean(onPickImages) && supportsImages && images.length < 5;
  const placeholder = running ? "Steer or add a follow-up…" : hero ? "Ask anything" : "Send follow-up";

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const serialized = serializeComposerEditable(editor);
    if (serialized !== value || composerNeedsChipRender(editor, value)) {
      const hadFocus = editor === editor.ownerDocument.activeElement;
      const caret = pendingCaretRef.current ?? (hadFocus ? getComposerCaretOffset(editor) : value.length);
      pendingCaretRef.current = null;
      renderComposerValue(editor, value, kindsRef.current);
      if (hadFocus || caret !== value.length) {
        setComposerCaretOffset(editor, caret);
      }
      scrollComposerCaretIntoView(editor);
    }
  }, [value]);

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

  function closeMention(): void {
    setMentionQuery(null);
    setSuggestions([]);
    setSearchStatus(null);
  }

  function syncMentionFromEditor(): void {
    const editor = editorRef.current;
    if (!editor || !onSearchReferences) {
      return;
    }
    const next = serializeComposerEditable(editor);
    const cursor = getComposerCaretOffset(editor);
    const mention = findAtQuery(next, cursor);
    if (!mention) {
      closeMention();
      return;
    }
    setMentionStart(mention.start);
    setMentionQuery(mention.query);
  }

  function handleEditorInput(): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const next = serializeComposerEditable(editor);
    onChange(next);
    if (!onSearchReferences) {
      return;
    }
    const cursor = getComposerCaretOffset(editor);
    const mention = findAtQuery(next, cursor);
    if (!mention) {
      closeMention();
      return;
    }
    setMentionStart(mention.start);
    setMentionQuery(mention.query);
  }

  function selectSuggestion(suggestion: PathSuggestion): void {
    const editor = editorRef.current;
    const cursor = editor ? getComposerCaretOffset(editor) : value.length;
    const next = insertAtMention(value, { start: mentionStart, query: mentionQuery ?? "" }, cursor, suggestion.path);
    kindsRef.current.set(suggestion.path, suggestion.kind);
    onChange(next.text);
    closeMention();
    requestAnimationFrame(() => {
      const field = editorRef.current;
      if (!field) {
        return;
      }
      field.focus();
      setComposerCaretOffset(field, next.cursor);
      syncMentionFromEditor();
    });
  }

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
        <>
          <label className="sr-only" htmlFor="thinking-selector">
            Thinking level
          </label>
          <select
            id="thinking-selector"
            data-testid="thinking-selector"
            className={cn(
              "composer-meta-select composer-thinking-select",
              isMaxThinkingLevel(thinkingLevel, availableThinkingLevels) && "is-max",
            )}
            value={thinkingLevel}
            disabled={selectorsDisabled || availableThinkingLevels.length === 0}
            onChange={(event) => onThinkingChange(event.target.value as ThinkingLevel)}
          >
            {availableThinkingLevels.map((level) => (
              <option key={level} value={level}>
                {thinkingLevelLabel(level)}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </>
  );

  const submit = running ? (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className="composer-queue-action"
        data-testid="steer-button"
        aria-label="Steer current run"
        title="Steer current run — changes the next model step after current tools"
        disabled={disabled || !canSend}
        onClick={() => {
          if (!disabled && canSend) {
            closeMention();
            onSteer?.();
          }
        }}
      >
        <WaypointsIcon className="size-3.5" aria-hidden="true" />
        Steer
      </button>
      <button
        type="button"
        className="composer-queue-action"
        data-testid="follow-up-button"
        aria-label="Add follow-up"
        title="Add follow-up — waits until the agent becomes idle"
        disabled={disabled || !canSend}
        onClick={() => {
          if (!disabled && canSend) {
            closeMention();
            onFollowUp?.();
          }
        }}
      >
        <ListPlusIcon className="size-3.5" aria-hidden="true" />
        Follow-up
      </button>
      <button
        type="button"
        className="relative isolate flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive enabled:cursor-pointer hover:bg-destructive/25 disabled:opacity-30"
        data-testid="stop-button"
        aria-label="Stop"
        onClick={onStop}
      >
        <SquareIcon className="size-3 fill-current" aria-hidden="true" />
      </button>
    </div>
  ) : (
    <button
      type="submit"
      className={cn(
        "relative isolate flex size-7 shrink-0 items-center justify-center rounded-full bg-message-action text-message-action-foreground enabled:cursor-pointer hover:opacity-90 disabled:pointer-events-none disabled:opacity-30",
      )}
      disabled={disabled || !canSend}
      aria-label="Send"
    >
      <ArrowUpIcon className="size-3.5 stroke-[2.2]" aria-hidden="true" />
    </button>
  );

  const usageStrip =
    usage || contextUsage ? (
      <ComposerUsage
        {...(usage ? { usage } : {})}
        {...(contextUsage ? { contextUsage } : {})}
      />
    ) : null;

  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        if (!running && canSend) {
          closeMention();
          onSubmit();
        }
      }}
    >
      <label className="sr-only" htmlFor="composer-input">
        Message
      </label>
      {queue && (queue.steering.length > 0 || queue.followUp.length > 0) ? (
        <div className="composer-queue" data-testid="composer-queue">
          {queue.steering.map((item, index) => (
            <span key={`steer:${index}`} className="composer-queue-chip is-steer">
              Steer · {item.text || "Image"}
            </span>
          ))}
          {queue.followUp.map((item, index) => (
            <span key={`follow:${index}`} className="composer-queue-chip is-follow-up">
              Follow-up · {item.text || "Image"}
            </span>
          ))}
        </div>
      ) : null}
      <div className="chat-composer-shell">
        <div className={cn("chat-composer-host", hero ? "px-3.5 pt-3 pb-2.5" : "px-3 pt-2.5 pb-2")}>
          <div className="relative z-10 flex flex-col">
            <div
              ref={editorRef}
              id="composer-input"
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
                hero ? "max-h-[min(52em,70vh)] min-h-[4.5em]" : "max-h-[min(48em,58vh)] min-h-[1.5em]",
              )}
              onInput={handleEditorInput}
              onKeyUp={syncMentionFromEditor}
              onClick={syncMentionFromEditor}
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
                closeMention();
                onChange(next.text);
              }}
              onKeyDown={(event) => {
                if (menuOpen && suggestions.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => (index + 1) % suggestions.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    const selected = suggestions[activeIndex];
                    if (selected) {
                      event.preventDefault();
                      selectSuggestion(selected);
                    }
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeMention();
                    return;
                  }
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!running && !disabled && canSend) {
                    closeMention();
                    onSubmit();
                  }
                }
              }}
            />
            {menuOpen ? (
              <div className="composer-mention-menu" role="listbox" aria-label="Workspace references" data-testid="composer-mentions">
                {suggestions.length === 0 ? (
                  <div className="composer-mention-empty">{searchStatus ?? "No matching files"}</div>
                ) : (
                  suggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.kind}:${suggestion.path}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={cn("composer-mention-option", index === activeIndex && "is-active")}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestion(suggestion);
                      }}
                    >
                      {suggestion.kind === "folder" ? (
                        <FolderIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                      ) : (
                        <FileIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                      )}
                      <span className="min-w-0 truncate">{suggestion.path}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
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
            <div className={cn("flex shrink-0 items-center justify-between gap-2", hero ? "mt-1.5" : "mt-1")}>
              <div className="flex min-w-0 items-center gap-0.5">
                {selectors}
                {onPickImages ? (
                  <button
                    type="button"
                    className="composer-attach-button"
                    data-testid="attach-images-button"
                    aria-label={
                      supportsImages
                        ? "Attach images"
                        : "The selected model does not accept images"
                    }
                    title={
                      supportsImages
                        ? "Attach PNG, JPEG, GIF, or WebP images"
                        : "The selected model does not accept images"
                    }
                    disabled={disabled || !canAttach}
                    onClick={() => {
                      if (canAttach) {
                        onPickImages();
                      }
                    }}
                  >
                    <PaperclipIcon className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              {submit}
            </div>
            {images.length > 0 ? (
              <p className="composer-image-disclosure">
                Sending an image transmits it to the selected model provider.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {usageStrip || (!hero && metaHint) ? (
        <div className="mt-1.5 flex min-w-0 items-center gap-3 px-1 text-[0.6875rem] leading-snug text-muted-foreground">
          {!hero && metaHint ? (
            <div className="flex min-w-0 items-center gap-1">
              <FolderIcon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
              <span className="min-w-0 truncate">{metaHint}</span>
            </div>
          ) : null}
          {usageStrip ? <div className="ml-auto min-w-0 shrink-0">{usageStrip}</div> : null}
        </div>
      ) : null}
    </form>
  );
}
