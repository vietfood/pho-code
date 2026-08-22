export function WorkingLabel({ text, live }: { text: string; live: boolean }) {
  return (
    <span className="working-label">
      <span
        className={live ? "working-shimmer" : "min-w-0 truncate font-medium"}
        {...(live ? { role: "status" } : {})}
      >
        {text}
      </span>
    </span>
  );
}
