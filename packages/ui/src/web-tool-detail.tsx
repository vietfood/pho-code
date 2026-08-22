import { useState, type MouseEvent } from "react";
import { SearchIcon } from "lucide-react";
import {
  uniqueWebHosts,
  WEB_SEARCH_PREVIEW_COUNT,
  type WebSourceRow,
} from "./lib/web-source";
import { WebSiteIcon } from "./web-site-icon";

export function WebHostStack({ rows }: { rows: readonly WebSourceRow[] }) {
  const hosts = uniqueWebHosts(rows);
  if (hosts.length === 0) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center" data-testid="web-site-icons" aria-hidden="true">
      {hosts.map((host, index) => (
        <span key={host} className={index > 0 ? "-ms-1" : undefined}>
          <WebSiteIcon host={host} size="sm" />
        </span>
      ))}
    </span>
  );
}

export function WebSearchResultList({
  query,
  results,
}: {
  query?: string | null;
  results: readonly WebSourceRow[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? results : results.slice(0, WEB_SEARCH_PREVIEW_COUNT);
  const hidden = results.length - visible.length;
  return (
    <div
      className="flex flex-col gap-0.5"
      data-testid="web-search-results"
      onClick={stopRowToggle}
      onPointerDown={stopRowToggle}
    >
      {query ? (
        <div
          className="flex min-w-0 items-center gap-2 px-0.5 py-0.5 text-[12.5px] text-muted-foreground"
          data-testid="web-search-query"
        >
          <SearchIcon className="block size-3.5 shrink-0 stroke-[1.8] opacity-80" aria-hidden="true" />
          <span className="min-w-0 truncate">{query}</span>
        </div>
      ) : null}
      {visible.map((row) => (
        <WebSourceLink key={row.url} row={row} />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          className="ms-6 py-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="web-search-more"
          onClick={(event) => {
            event.stopPropagation();
            setShowAll(true);
          }}
        >
          +{hidden} more
        </button>
      ) : null}
    </div>
  );
}

export function WebFetchSource({ source }: { source: WebSourceRow }) {
  return (
    <div className="min-w-0" data-testid="web-fetch-source" onClick={stopRowToggle} onPointerDown={stopRowToggle}>
      <WebSourceLink row={source} />
    </div>
  );
}

function WebSourceLink({ row }: { row: WebSourceRow }) {
  const showHost = row.displayHost.toLowerCase() !== row.title.trim().toLowerCase();
  return (
    <a
      href={row.url}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-center gap-2 rounded-md px-0.5 py-0.5 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={row.url}
    >
      <WebSiteIcon host={row.host} />
      <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">{row.title}</span>
      {showHost ? (
        <span className="max-w-[10rem] shrink-0 truncate text-[11px] text-muted-foreground">{row.displayHost}</span>
      ) : null}
    </a>
  );
}

function stopRowToggle(event: MouseEvent<HTMLElement>): void {
  event.stopPropagation();
}
