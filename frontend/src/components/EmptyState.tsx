type EmptyVariant =
  | "no-results"
  | "cold-start"
  | "error"
  | "loading-failed"
  | "watchlist-empty";

interface EmptyStateProps {
  variant: EmptyVariant;
  /** Optional override message */
  message?: string;
  /** Optional action button label */
  actionLabel?: string;
  onAction?: () => void;
}

const VARIANTS: Record<EmptyVariant, { icon: string; title: string; body: string }> = {
  "no-results": {
    icon: "search_off",
    title: "No games match your filters",
    body: "Try widening the days range or price filter.",
  },
  "cold-start": {
    icon: "hourglass_empty",
    title: "Building the database…",
    body: "The first collector run is in progress. Check back in a few minutes.",
  },
  "error": {
    icon: "error_outline",
    title: "Something went wrong",
    body: "Failed to load data. The backend may be starting up.",
  },
  "loading-failed": {
    icon: "wifi_off",
    title: "Could not reach the API",
    body: "Check your connection or try refreshing.",
  },
  "watchlist-empty": {
    icon: "bookmark_border",
    title: "Your watchlist is empty",
    body: "Bookmark games from the database to track them here.",
  },
};

/** Branded empty state for tables, lists, and detail pages. */
export default function EmptyState({ variant, message, actionLabel, onAction }: EmptyStateProps) {
  const { icon, title, body } = VARIANTS[variant];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span
        className="material-symbols-outlined text-border-dark mb-4"
        style={{ fontSize: 48 }}
      >
        {icon}
      </span>
      <p className="text-text-main font-bold text-sm mb-1">{title}</p>
      <p className="text-text-dim text-xs max-w-xs">{message ?? body}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-1.5 rounded text-xs font-bold bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
