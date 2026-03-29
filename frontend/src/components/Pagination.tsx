interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  activeScrapers?: number;
  totalScrapers?: number;
  lastSync?: string | null;
}

function timeAgo(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)} mins ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  activeScrapers = 0,
  totalScrapers = 12,
  lastSync,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages: (number | "...")[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <footer className="bg-surface-dark border-t border-border-dark px-6 py-3 flex items-center justify-between text-[11px] font-bold text-text-dim uppercase tracking-widest shadow-2xl">
      <div className="flex items-center gap-6">
        <p>
          Showing{" "}
          <span className="text-text-main">{total > 0 ? start : 0}–{end}</span> of{" "}
          <span className="text-text-main">{total}</span> Games
        </p>
        <div className="h-4 w-[1px] bg-border-dark" />
        <p>
          Active Scrapers:{" "}
          <span className={activeScrapers > 0 ? "text-green-400 font-mono" : "text-green-400 font-mono"}>
            {activeScrapers}/{totalScrapers}
          </span>
        </p>
        <div className="h-4 w-[1px] bg-border-dark" />
        <p>
          Last Sync:{" "}
          <span className="text-primary font-mono">{timeAgo(lastSync)}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="p-1.5 hover:bg-background-dark border border-border-dark rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>

        <div className="flex gap-1.5">
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`dots-${i}`} className="px-1 text-border-dark">
                ...
              </span>
            ) : (
              <button
                key={p}
                className={
                  p === page
                    ? "px-3 py-1 bg-primary text-white rounded font-black shadow-lg shadow-primary/20"
                    : "px-3 py-1 hover:bg-background-dark border border-transparent hover:border-border-dark rounded transition-colors"
                }
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            )
          )}
        </div>

        <button
          className="p-1.5 hover:bg-background-dark border border-border-dark rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
    </footer>
  );
}
