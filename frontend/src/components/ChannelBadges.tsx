import type { YoutubeChannelBrief } from "../types";

interface ChannelBadgesProps {
  channels: YoutubeChannelBrief[];
  /** Max channels to show before "+N more" label. Default 3. */
  maxVisible?: number;
  /** Days since launch — shows "No coverage yet" text for new games. */
  daysSince?: number | null;
}

export function channelBadgeTag(ch: YoutubeChannelBrief): "HIGH REACH" | "VIRAL" | null {
  if (ch.subscriber_count != null && ch.subscriber_count >= 5_000_000) return "HIGH REACH";
  if (ch.top_video_views != null && ch.top_video_views >= 500_000) return "VIRAL";
  return null;
}

/** YouTube channel coverage badges with VIRAL/HIGH REACH tags. */
export default function ChannelBadges({ channels, maxVisible = 3, daysSince }: ChannelBadgesProps) {
  if (channels.length === 0) {
    return (
      <span className="text-text-dim italic text-xs">
        {daysSince != null && daysSince <= 14 ? "No coverage yet" : "—"}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {channels.slice(0, maxVisible).map((ch) => {
        const tag = channelBadgeTag(ch);
        return (
          <span
            key={ch.channel_id}
            className={`px-1.5 py-0 rounded text-[9px] font-bold tracking-wide ${
              tag === "HIGH REACH"
                ? "bg-status-special/10 text-status-special border border-status-special/20"
                : tag === "VIRAL"
                ? "bg-status-neg/10 text-status-neg border border-status-neg/20"
                : "bg-surface-dark text-text-dim border border-border-dark"
            }`}
          >
            {ch.name.toUpperCase()}
            {tag && <span className="ml-1 text-[8px] opacity-70">{tag}</span>}
          </span>
        );
      })}
      {channels.length > maxVisible && (
        <span className="text-[9px] text-text-dim">+{channels.length - maxVisible}</span>
      )}
    </div>
  );
}
