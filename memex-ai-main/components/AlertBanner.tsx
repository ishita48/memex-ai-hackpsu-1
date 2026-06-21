"use client";

import { useState, useEffect } from "react";
import { getCsrfToken } from "@/lib/csrf";

interface Props { color: string; }

export default function AlertBanner({ color }: Props) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("unread");

  const fetchAlerts = () => {
    setLoading(true);
    const param = filter === "unread" ? "?unread=true" : "";
    fetch(`/api/alerts${param}`)
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAlerts(); }, [filter]);

  const acknowledge = async (id: string) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken(),
      },
      body: JSON.stringify({ id }),
    });
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  };

  const acknowledgeAll = async () => {
    for (const a of alerts.filter((a) => !a.acknowledged)) {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ id: a.id }),
      });
    }
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffM = Math.round((now.getTime() - d.getTime()) / (1000 * 60));
    if (diffM < 1) return "just now";
    if (diffM < 60) return `${diffM}m ago`;
    const diffH = Math.round(diffM / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.round(diffH / 24)}d ago`;
  };

  const sevColor: Record<string, string> = {
    critical: "#ff2d55", high: "#ff9f0a", medium: "#ffd60a", low: "#30d158",
  };

  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(["unread", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border transition-all"
              style={{
                borderColor: filter === f ? color + "40" : "#1a1a1f",
                background: filter === f ? color + "10" : "transparent",
                color: filter === f ? color : "#555",
              }}>
              {f} {f === "unread" && unreadCount > 0 ? `(${unreadCount})` : ""}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button onClick={acknowledgeAll}
            className="px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-[#1a1a1f] text-[#555] hover:text-[#888] hover:border-[#333] transition">
            Acknowledge All
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-[#555]">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-3 opacity-30">🔔</div>
          <div className="text-xs text-[#555]">
            {filter === "unread"
              ? "No unread alerts. All clear!"
              : "No alerts yet. Critical/high severity events trigger alerts automatically."}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((alert, i) => {
            const sc = sevColor[alert.severity] || "#ffd60a";
            return (
              <div key={alert.id}
                className="bg-[#0d0d0f] border border-[#1a1a1f] rounded-lg px-4 py-3 transition-all"
                style={{
                  borderLeftWidth: "3px", borderLeftColor: sc,
                  opacity: alert.acknowledged ? 0.5 : 1,
                  animation: `fadeSlideIn 0.3s ease ${i * 0.05}s both`,
                }}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                        style={{ color: sc, background: sc + "15", border: `1px solid ${sc}30` }}>
                        {alert.severity}
                      </span>
                      <span className="text-[10px] text-[#555]">{formatTime(alert.created_at)}</span>
                      {alert.acknowledged && <span className="text-[9px] text-[#30d158]">✓ acknowledged</span>}
                    </div>
                    <div className="text-[12px] text-[#ddd] font-mono">{alert.title}</div>
                    {alert.message && <div className="text-[11px] text-[#777] mt-1">{alert.message}</div>}
                  </div>
                  {!alert.acknowledged && (
                    <button onClick={() => acknowledge(alert.id)}
                      className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-[#1a1a1f] text-[#555] hover:text-[#888] hover:border-[#333] transition shrink-0">
                      Ack
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}