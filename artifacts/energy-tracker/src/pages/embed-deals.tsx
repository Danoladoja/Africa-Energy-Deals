import { useEffect, useState } from "react";
import { ExternalLink, Zap } from "lucide-react";

const API = "/api";

const SECTOR_COLORS: Record<string, string> = {
  "Solar":          "#facc15",
  "Wind":           "#38bdf8",
  "Hydro":          "#22d3ee",
  "Grid & Storage": "#a78bfa",
  "Oil & Gas":      "#f87171",
  "Coal":           "#6b7280",
  "Nuclear":        "#fb923c",
  "Bioenergy":      "#4ade80",
};

const COUNTRY_FLAGS: Record<string, string> = {
  "South Africa": "🇿🇦", "Nigeria": "🇳🇬", "Kenya": "🇰🇪", "Egypt": "🇪🇬",
  "Morocco": "🇲🇦", "Ethiopia": "🇪🇹", "Ghana": "🇬🇭", "Tanzania": "🇹🇿",
  "Mozambique": "🇲🇿", "Zambia": "🇿🇲", "Uganda": "🇺🇬", "Senegal": "🇸🇳",
  "Ivory Coast": "🇨🇮", "Cameroon": "🇨🇲", "Angola": "🇦🇴", "Rwanda": "🇷🇼",
  "Namibia": "🇳🇦", "Botswana": "🇧🇼", "Tunisia": "🇹🇳", "Algeria": "🇩🇿",
  "Malawi": "🇲🇼", "Mali": "🇲🇱", "Niger": "🇳🇪", "Chad": "🇹🇩",
  "Sudan": "🇸🇩", "Burkina Faso": "🇧🇫",
};

interface Project {
  id: number;
  projectName: string;
  country: string;
  technology: string;
  dealSizeUsdMn?: number;
  status?: string;
  announcedYear?: number;
  developer?: string;
}

function fmt(mn?: number) {
  if (!mn) return null;
  if (mn >= 1000) return `$${(mn / 1000).toFixed(1)}B`;
  return `$${mn.toFixed(0)}M`;
}

export default function EmbedDeals() {
  const params = new URLSearchParams(window.location.search);
  const technology = params.get("technology") ?? undefined;
  const country = params.get("country") ?? undefined;
  const limit = Math.min(Number(params.get("limit") ?? "5"), 20);
  const theme = params.get("theme") ?? "dark";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams({ limit: String(limit), page: "1" });
    if (technology) q.set("technology", technology);
    if (country) q.set("country", country);

    fetch(`${API}/projects?${q}`)
      .then((r) => r.json())
      .then((d: { projects?: Project[] }) => {
        setProjects((d.projects ?? []).slice(0, limit));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isDark = theme !== "light";
  const bg = isDark ? "#0b0f1a" : "#f8fafc";
  const cardBg = isDark ? "#1e293b" : "#ffffff";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const textPrimary = isDark ? "#f1f5f9" : "#0f172a";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";

  const trackerUrl = "https://afrienergytracker.io";

  const filterLabel = [
    technology ? `${technology}` : null,
    country ? `in ${country}` : null,
  ].filter(Boolean).join(" ");

  return (
    <div
      style={{
        backgroundColor: bg,
        minHeight: "100vh",
        padding: "16px",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "8px",
              background: "linear-gradient(135deg, #00e676, #00b8d4)",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Zap size={14} color="#0b0f1a" />
            </div>
            <span style={{ fontWeight: 700, fontSize: "14px", color: textPrimary }}>
              Latest{filterLabel ? ` ${filterLabel}` : ""} Deals
            </span>
          </div>
          <a
            href={trackerUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "11px", color: "#00e676", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}
          >
            AfriEnergy Tracker
            <ExternalLink size={10} />
          </a>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {Array.from({ length: limit }).map((_, i) => (
              <div key={i} style={{ height: "76px", borderRadius: "12px", backgroundColor: cardBg, opacity: 0.5 }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: textSecondary, fontSize: "13px" }}>
            No deals found{filterLabel ? ` for ${filterLabel}` : ""}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {projects.map((p) => {
              const color = SECTOR_COLORS[p.technology] ?? "#94a3b8";
              const flag = COUNTRY_FLAGS[p.country] ?? "🌍";
              const size = fmt(p.dealSizeUsdMn);
              return (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: cardBg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div style={{
                    width: "4px", height: "40px", borderRadius: "4px",
                    backgroundColor: color, flexShrink: 0
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: "13px", color: textPrimary,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>
                      {p.projectName}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: textSecondary }}>
                        {flag} {p.country}
                      </span>
                      <span style={{
                        fontSize: "10px", fontWeight: 600, padding: "2px 7px",
                        borderRadius: "999px", backgroundColor: `${color}22`, color
                      }}>
                        {p.technology}
                      </span>
                      {p.announcedYear && (
                        <span style={{ fontSize: "11px", color: textSecondary }}>{p.announcedYear}</span>
                      )}
                    </div>
                  </div>
                  {size && (
                    <div style={{ flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: "14px", color: "#00e676" }}>{size}</div>
                      <div style={{ fontSize: "10px", color: textSecondary, marginTop: "1px" }}>deal size</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <a
          href={trackerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
            marginTop: "14px", padding: "10px", borderRadius: "10px",
            border: `1px solid ${borderColor}`, backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
            textDecoration: "none", color: textSecondary, fontSize: "12px",
            transition: "color 0.15s",
          }}
        >
          View all deals on AfriEnergy Tracker
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
