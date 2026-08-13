export function ChatHeader({
  modelError,
  yoloMode,
}: {
  modelError?: string;
  yoloMode?: boolean;
}) {
  return (
    <header className="workspace-topbar drag-region gap-3 px-3 sm:px-5">
      <div className="min-w-0 flex-1" aria-hidden="true" />
      {yoloMode ? (
        <p
          className="shrink-0 rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-medium text-warning"
          role="status"
          data-testid="yolo-indicator"
        >
          YOLO on
        </p>
      ) : null}
      {modelError ? (
        <p className="max-w-[16rem] truncate text-sm text-destructive-foreground" role="alert" title={modelError}>
          {modelError}
        </p>
      ) : null}
    </header>
  );
}
