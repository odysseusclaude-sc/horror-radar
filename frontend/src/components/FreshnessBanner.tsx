import { useState } from "react";

interface FreshnessBannerProps {
  lastSync: string | null;
}

function hoursSince(isoString: string | null): number | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

export default function FreshnessBanner({ lastSync }: FreshnessBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const hours = hoursSince(lastSync);
  if (hours === null || hours < 26) return null;

  const isStale = hours >= 48;
  const hoursDisplay = Math.floor(hours);

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm font-mono border-b ${
        isStale
          ? "bg-status-neg/10 border-status-neg/30 text-status-neg"
          : "bg-status-warn/10 border-status-warn/30 text-status-warn"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          {isStale ? "error" : "warning"}
        </span>
        <span>
          Data last synced{" "}
          <span className="font-bold">{hoursDisplay}h ago</span>
          {isStale
            ? " — collectors may be down. Scores may be stale."
            : " — next sync overdue."}
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        title="Dismiss"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          close
        </span>
      </button>
    </div>
  );
}
