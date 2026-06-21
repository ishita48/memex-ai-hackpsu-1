"use client";

import { useState, useEffect } from "react";

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  open: { bg: "#ff2d5515", border: "#ff2d55", text: "#ff2d55" },
  investigating: { bg: "#ff9f0a15", border: "#ff9f0a", text: "#ff9f0a" },
  resolved: { bg: "#30d15815", border: "#30d158", text: "#30d158" },
};

const SEV_COLORS: Record<string, string> = {
  critical: "#ff2d55",
  high: "#ff9f0a",
  medium: "#ffd60a",
  low: "#30d158",
};

interface Props { mode: string; color: string; }

export default function IncidentList({ mode, color }: Props) {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  useEffect(() => {
    setLoading(true);
    const safeMode = encodeURIComponent(mode);
    const safeStatus = encodeURIComponent(filter === "all" ? "" : filter);
    const statusParam = safeStatus ? `&status=${safeStatus}` : "";
    fetch(`/api/incidents?mode=${safeMode}${statusParam}`)
      .then((r) => r.json())
      .then((d) => setIncidents(d.incidents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mode, filter]);

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); setMemories([]); return; }
    setExpanded(id);
    setLoadingMemories(true);
    try {
      const res = await fetch(`/api/incidents?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      setMemories(data.memories || []);
    } catch { setMemories([]); }
    setLoadingMemories(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setIncidents((prev) => prev.map((inc) => (inc.id === id ? { ...inc, status } : inc)));
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    return `${Math.round(diffH / 24)}d ago`;
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {["all", "open", "investigating", "resolved"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border transition-all"
            style={{
              borderColor: filter === f ? color + "40" : "#1a1a1f",
              background: filter === f ? color + "10" : "transparent",
              color: filter === f ? color : "#555",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-[#555]">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12 text-xs text-[#555]">
          No incidents found. Ingest some data to start clustering.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {incidents.map((inc, i) => {
            const sc = STATUS_COLORS[inc.status] || STATUS_COLORS.open;
            const sevColor = SEV_COLORS[inc.severity] || "#ffd60a";
            const isExpanded = expanded === inc.id;

            return (
              <div
                key={inc.id}
                className="bg-[#0d0d0f] border border-[#1a1a1f] rounded-lg overflow-hidden transition-all"
                style={{ borderLeftWidth: "3px", borderLeftColor: sevColor, animation: `fadeSlideIn 0.3s ease ${i * 0.05}s both` }}
              >
                <div className="px-4 py-3 cursor-pointer hover:bg-[#111114] transition-colors" onClick={() => toggleExpand(inc.id)}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: sc.text, background: sc.bg, border: `1px solid ${sc.border}` }}>
                          {inc.status}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: sevColor, background: sevColor + "15", border: `1px solid ${sevColor}30` }}>
                          {inc.severity}
                        </span>
                        <span className="text-[10px] text-[#444] font-mono">
                          {inc.event_count} event{inc.event_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#ddd] font-mono leading-relaxed">
                        {inc.title || "Untitled incident"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-[#555]">{formatTime(inc.last_seen)}</div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className="text-[#444] mt-1 ml-auto transition-transform"
                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}>
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#1a1a1f] px-4 py-3 animate-[fadeIn_0.2s_ease]">
                    <div className="flex gap-2 mb-3">
                      {inc.status !== "investigating" && (
                        <button onClick={() => updateStatus(inc.id, "investigating")}
                          className="px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-[#ff9f0a30] bg-[#ff9f0a10] text-[#ff9f0a] hover:bg-[#ff9f0a20] transition">
                          Investigate
                        </button>
                      )}
                      {inc.status !== "resolved" && (
                        <button onClick={() => updateStatus(inc.id, "resolved")}
                          className="px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-[#30d15830] bg-[#30d15810] text-[#30d158] hover:bg-[#30d15820] transition">
                          Resolve
                        </button>
                      )}
                      {inc.status === "resolved" && (
                        <button onClick={() => updateStatus(inc.id, "open")}
                          className="px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-[#ff2d5530] bg-[#ff2d5510] text-[#ff2d55] hover:bg-[#ff2d5520] transition">
                          Reopen
                        </button>
                      )}
                    </div>

                    <div className="flex gap-4 mb-3 text-[10px] text-[#555]">
                      <span>First seen: {formatTime(inc.first_seen)}</span>
                      <span>Last seen: {formatTime(inc.last_seen)}</span>
                    </div>

                    {loadingMemories ? (
                      <div className="text-[11px] text-[#555]">Loading events...</div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-[10px] text-[#444] uppercase tracking-widest mb-1">
                          Related Events ({memories.length})
                        </div>
                        {memories.slice(0, 5).map((m) => (
                          <div key={m.id} className="p-2.5 rounded bg-[#08080a] border border-[#151518] text-[11px] text-[#999] font-mono leading-relaxed">
                            <span className="text-[#555] text-[9px]">{formatTime(m.created_at)} · {m.source}</span>
                            <div className="mt-1 text-[#bbb]">
                              {m.content.slice(0, 200)}{m.content.length > 200 ? "..." : ""}
                            </div>
                          </div>
                        ))}
                        {memories.length > 5 && (
                          <div className="text-[10px] text-[#444]">+{memories.length - 5} more events</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}