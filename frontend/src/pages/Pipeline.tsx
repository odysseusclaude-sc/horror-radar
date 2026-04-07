import { useEffect, useState, useCallback } from "react";
import { fetchOne, fetchPaginated } from "../api/client";

interface CollectorHealth {
  status: "healthy" | "stale" | "dead" | "never_run";
  last_success?: string;
  hours_ago?: number | null;
  items_processed?: number;
  items_failed?: number;
  api_calls_made?: number;
}

interface PipelineHealthData {
  timestamp: string;
  overall: "healthy" | "degraded";
  collectors: Record<string, CollectorHealth>;
  queue: {
    total_pending: number;
    eligible_now: number;
    dead_letters: number;
  };
}

interface CollectionRun {
  id: number;
  job_name: string;
  status: string;
  items_processed: number;
  items_failed: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  healthy: "text-status-pos",
  stale: "text-status-warn",
  dead: "text-status-neg",
  never_run: "text-text-dim",
};

const RUN_STATUS_COLOR: Record<string, string> = {
  success: "text-status-pos",
  partial: "text-status-warn",
  failed: "text-status-neg",
  running: "text-status-special",
  stale: "text-status-warn",
  circuit_open: "text-status-neg",
};

const COLLECTOR_LABELS: Record<string, string> = {
  metadata: "Metadata",
  reviews: "Reviews",
  ccu: "CCU",
  youtube_scanner: "YT Scanner",
  youtube_stats: "YT Stats",
  twitch: "Twitch",
  reddit: "Reddit",
  ops: "OPS",
};

function timeAgo(isoStr: string | null | undefined): string {
  if (!isoStr) return "--";
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "--";
  return new Date(isoStr).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function Pipeline() {
  const [health, setHealth] = useState<PipelineHealthData | null>(null);
  const [runs, setRuns] = useState<CollectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [healthData, runsData] = await Promise.all([
        fetchOne<PipelineHealthData>("/health/pipeline"),
        fetchPaginated<CollectionRun>("/runs", { page: 1, page_size: 10 }),
      ]);
      setHealth(healthData);
      setRuns(runsData.data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch pipeline data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-dim font-mono text-sm">
        Loading pipeline data...
      </div>
    );
  }

  const collectors = health?.collectors ?? {};
  const queue = health?.queue ?? { total_pending: 0, eligible_now: 0, dead_letters: 0 };

  return (
    <main className="flex-1 px-4 md:px-6 py-6 max-w-6xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-text-main">
            Pipeline Health
          </h1>
          <p className="text-xs font-mono text-text-dim mt-0.5">
            Auto-refresh every 30s · Last: {lastRefresh ? timeAgo(lastRefresh.toISOString()) : "--"}
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded text-xs font-black uppercase tracking-widest border ${
          health?.overall === "healthy"
            ? "bg-status-pos/10 border-status-pos/30 text-status-pos"
            : "bg-status-warn/10 border-status-warn/30 text-status-warn"
        }`}>
          {health?.overall ?? "unknown"}
        </div>
      </div>

      {/* Pipeline flow diagram */}
      <section className="bg-surface-dark border border-border-dark rounded-lg p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-dim mb-4">Pipeline Flow</h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { label: "Discovery", sub: "Steam + SteamSpy" },
            { label: "Queue", sub: `${queue.total_pending} pending` },
            { label: "Metadata", sub: "Horror classifier" },
            { label: "Games DB", sub: "OPS scoring" },
          ].map((node, i, arr) => (
            <div key={node.label} className="flex items-center gap-2 flex-shrink-0">
              <div className="bg-background-dark border border-border-dark rounded px-3 py-2 text-center min-w-[90px]">
                <div className="text-xs font-bold text-text-main">{node.label}</div>
                <div className="text-[10px] font-mono text-text-dim mt-0.5">{node.sub}</div>
              </div>
              {i < arr.length - 1 && (
                <span className="text-border-dark text-lg">→</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Collector health grid */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-dim mb-3">Collector Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(collectors).map(([name, data]) => (
            <div key={name} className="bg-surface-dark border border-border-dark rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-text-main">
                  {COLLECTOR_LABELS[name] ?? name}
                </span>
                <span className={`text-[10px] font-black uppercase tracking-wider ${STATUS_COLOR[data.status] ?? "text-text-dim"}`}>
                  {data.status}
                </span>
              </div>
              {data.hours_ago != null ? (
                <>
                  <div className="text-[11px] font-mono text-text-dim">
                    {data.hours_ago < 1
                      ? `${Math.round(data.hours_ago * 60)}m ago`
                      : `${data.hours_ago.toFixed(1)}h ago`}
                  </div>
                  {data.items_processed != null && (
                    <div className="text-[10px] font-mono text-text-dim mt-0.5">
                      {data.items_processed} processed · {data.items_failed ?? 0} failed
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[11px] font-mono text-text-dim">Never run</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Queue stats */}
      <section className="bg-surface-dark border border-border-dark rounded-lg p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-dim mb-4">Queue Stats</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-black font-mono text-text-main">{queue.total_pending}</div>
            <div className="text-xs text-text-dim uppercase tracking-wider mt-1">Total Pending</div>
          </div>
          <div>
            <div className={`text-2xl font-black font-mono ${queue.eligible_now > 0 ? "text-status-pos" : "text-text-dim"}`}>
              {queue.eligible_now}
            </div>
            <div className="text-xs text-text-dim uppercase tracking-wider mt-1">Eligible Now</div>
          </div>
          <div>
            <div className={`text-2xl font-black font-mono ${queue.dead_letters > 0 ? "text-status-neg" : "text-text-dim"}`}>
              {queue.dead_letters}
            </div>
            <div className="text-xs text-text-dim uppercase tracking-wider mt-1">Dead Letters</div>
          </div>
        </div>
      </section>

      {/* Recent collection runs */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-dim mb-3">Recent Runs</h2>
        <div className="bg-surface-dark border border-border-dark rounded-lg overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border-dark text-text-dim uppercase tracking-widest text-[10px]">
                <th className="px-4 py-2.5 text-left">Job</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-right">Processed</th>
                <th className="px-4 py-2.5 text-right">Failed</th>
                <th className="px-4 py-2.5 text-right">Started</th>
                <th className="px-4 py-2.5 text-right hidden md:table-cell">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const duration = run.started_at && run.finished_at
                  ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                  : null;
                return (
                  <tr key={run.id} className="border-b border-border-dark/50 hover:bg-background-dark transition-colors">
                    <td className="px-4 py-2.5 font-bold text-text-main">{run.job_name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-bold ${RUN_STATUS_COLOR[run.status] ?? "text-text-dim"}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-main">{run.items_processed}</td>
                    <td className={`px-4 py-2.5 text-right ${run.items_failed > 0 ? "text-status-neg" : "text-text-dim"}`}>
                      {run.items_failed}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-dim">
                      {timeAgo(run.started_at)}
                      <div className="text-[10px] opacity-60">{formatDateTime(run.started_at)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-dim hidden md:table-cell">
                      {duration != null
                        ? duration < 60 ? `${duration}s` : `${Math.round(duration / 60)}m`
                        : "--"}
                    </td>
                  </tr>
                );
              })}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-dim">
                    No collection runs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
