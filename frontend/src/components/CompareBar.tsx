import { useNavigate } from "react-router-dom";
import type { GameListItem } from "../types";

interface CompareBarProps {
  compareList: number[];
  games: GameListItem[];        // current page games — used for titles when available
  onRemove: (appid: number) => void;
  onClear: () => void;
}

/** Fixed bottom slide-in bar shown when ≥2 games are selected for comparison. */
export default function CompareBar({ compareList, games, onRemove, onClear }: CompareBarProps) {
  const navigate = useNavigate();

  if (compareList.length < 1) return null;

  const gameMap = new Map(games.map((g) => [g.appid, g]));

  function handleCompare() {
    if (compareList.length < 2) return;
    navigate(`/compare?ids=${compareList.join(",")}`);
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#1a1a1c",
        borderTop: "1px solid #2a2420",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        zIndex: 50,
        boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
        transform: compareList.length >= 1 ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.25s ease",
      }}
    >
      {/* Label */}
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          color: "#6b6058",
          flexShrink: 0,
        }}
      >
        Compare ({compareList.length}/3)
      </span>

      {/* Slots */}
      <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
        {compareList.map((appid) => {
          const g = gameMap.get(appid);
          return (
            <div
              key={appid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#111314",
                border: "1px solid #2a2420",
                borderRadius: 4,
                padding: "4px 10px",
              }}
            >
              {g?.header_image_url && (
                <img
                  src={g.header_image_url}
                  alt={g.title}
                  style={{ width: 32, height: 15, objectFit: "cover", borderRadius: 2 }}
                />
              )}
              <span
                style={{
                  fontFamily: "'Public Sans', sans-serif",
                  fontSize: 11,
                  color: "#e8e0d4",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g?.title ?? `#${appid}`}
              </span>
              <button
                onClick={() => onRemove(appid)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b6058",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={onClear}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            padding: "5px 12px",
            borderRadius: 4,
            cursor: "pointer",
            border: "1px solid #2a2420",
            background: "transparent",
            color: "#6b6058",
            transition: "all 0.15s",
          }}
        >
          Clear
        </button>
        <button
          onClick={handleCompare}
          disabled={compareList.length < 2}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            padding: "5px 14px",
            borderRadius: 4,
            cursor: compareList.length < 2 ? "not-allowed" : "pointer",
            border: "1px solid #802626",
            background: compareList.length < 2 ? "transparent" : "#80262615",
            color: compareList.length < 2 ? "#3a3430" : "#802626",
            transition: "all 0.15s",
          }}
        >
          Compare →
        </button>
      </div>
    </div>
  );
}
