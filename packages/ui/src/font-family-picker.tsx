import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { sanitizeFontFamilyName } from "@pho-code/protocol";
import { cn } from "./lib/cn";
import { queryInstalledFontFamilies } from "./lib/installed-fonts";
import { Button } from "./ui/button";

const SYSTEM_VALUE = "";
const CONTROL_CLASS =
  "h-8 w-44 max-w-[min(11rem,42vw)] min-w-0 justify-between gap-2 px-2.5 font-normal";

export function FontFamilyPicker({
  id,
  ariaLabel,
  value,
  disabled,
  testId,
  onChange,
}: {
  id: string;
  ariaLabel: string;
  value: string;
  disabled: boolean;
  testId: string;
  onChange: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [families, setFamilies] = useState<readonly string[] | null>(null);
  const [draft, setDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const filterId = useId();
  const enumerated = families !== null && families.length > 0;
  const loading = families === null;
  const display = value.length === 0 ? "System font" : value;

  useEffect(() => {
    let cancelled = false;
    void queryInstalledFontFamilies().then((next) => {
      if (!cancelled) {
        setFamilies(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    filterRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items = useMemo(() => {
    const haystack = families ?? [];
    const needle = query.trim().toLowerCase();
    const matches =
      needle.length === 0 ? haystack : haystack.filter((family) => family.toLowerCase().includes(needle));
    const systemMatches = needle.length === 0 || "system font".includes(needle);
    return systemMatches ? [SYSTEM_VALUE, ...matches] : matches;
  }, [families, query]);

  function commitTyped(next: string): void {
    const sanitized = sanitizeFontFamilyName(next);
    if (sanitized === null) {
      setDraft(value);
      return;
    }
    setDraft(sanitized);
    if (sanitized !== value) {
      onChange(sanitized);
    }
  }

  if (loading) {
    return (
      <Button
        type="button"
        id={id}
        size="sm"
        variant="outline"
        disabled
        data-testid={testId}
        aria-label={ariaLabel}
        className={CONTROL_CLASS}
      >
        <span className="min-w-0 truncate">{display}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </Button>
    );
  }

  if (!enumerated) {
    return (
      <input
        id={id}
        type="text"
        data-testid={testId}
        aria-label={ariaLabel}
        className="h-8 w-44 max-w-[min(11rem,42vw)] rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24"
        disabled={disabled}
        placeholder="System font"
        value={draft}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => commitTyped(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitTyped(draft);
          }
        }}
      />
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        id={id}
        size="sm"
        variant="outline"
        disabled={disabled}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={CONTROL_CLASS}
        style={value.length === 0 ? undefined : { fontFamily: value }}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{display}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </Button>
      {open ? (
        <div className="absolute end-0 z-20 mt-1 flex w-72 max-w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <div className="relative border-b border-border/70 px-2 py-1.5">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground/70"
            />
            <label className="sr-only" htmlFor={filterId}>
              Search fonts
            </label>
            <input
              ref={filterRef}
              id={filterId}
              type="search"
              data-testid={`${testId}-filter`}
              className="h-7 w-full rounded-sm bg-transparent ps-6 text-sm outline-none"
              placeholder="Search fonts…"
              value={query}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            data-testid={`${testId}-list`}
            className="max-h-64 overflow-auto p-1"
            aria-label={ariaLabel}
          >
            {items.length === 0 ? (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">No fonts found.</li>
            ) : (
              items.map((family) => {
                const selected = family === value;
                const title = family.length === 0 ? "System font" : family;
                return (
                  <li key={family.length === 0 ? "__system__" : family} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-testid={`${testId}-option`}
                      data-family={family}
                      className={cn(
                        "flex w-full min-w-0 items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-sm",
                        selected ? "bg-accent" : "hover:bg-accent/70",
                      )}
                      style={family.length === 0 ? undefined : { fontFamily: family }}
                      onClick={() => {
                        setOpen(false);
                        if (family !== value) {
                          onChange(family);
                        }
                      }}
                    >
                      <span className="min-w-0 truncate">{title}</span>
                      {selected ? <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
