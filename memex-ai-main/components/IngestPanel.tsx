"use client";

import { useState, useRef } from "react";

interface IngestPanelProps {
  color: string;
  mode: string;
  onIngest: (content: string, source: string, metadata?: Record<string, any>) => Promise<any>;
}

type IngestMode = "paste" | "structured" | "upload";

export default function IngestPanel({ color, mode, onIngest }: IngestPanelProps) {
  const [ingestMode, setIngestMode] = useState<IngestMode>("paste");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [bulkCount, setBulkCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [commit, setCommit] = useState("");
  const [service, setService] = useState("");
  const [extraMeta, setExtraMeta] = useState("");

  const severityOptions = ["critical", "high", "medium", "low"];

  const placeholders: Record<string, string> = {
    sentry:
      "Paste a real error log, stack trace, or exception...\n\nExample:\njava.lang.NullPointerException\n  at com.app.UserService.getProfile(UserService.java:87)\n  at com.app.ApiController.handleRequest(ApiController.java:142)\nCaused by: expired session token during refresh cycle",
    comcast:
      "Paste network log, monitoring alert, or event...\n\nExample:\n[ALERT] Node CHI-042 latency spike: 340ms avg (baseline: 12ms)\nBGP route flapping detected on upstream peer AS7018\nTraffic rerouted through DAL-017, affecting 12,400 customers",
    base44:
      "Paste API log, deploy event, or infra alert...\n\nExample:\n[DEPLOY v2.14.0] Schema migration failed\nusers_v3: dropped NOT NULL on email column\nDownstream services returning 500 on null email reads\nAuto-rollback triggered at 14:32 UTC",
  };

  const handlePasteSubmit = async () => {
    if (!content.trim()) return;
    setStatus("loading");
    try {
      const metadata: Record<string, any> = {
        severity,
        source: source.trim() || "manual-input",
        status: "new",
        ingested_via: "dashboard-paste",
      };
      await onIngest(content.trim(), source.trim() || "manual-input", metadata);
      setStatus("success");
      setMessage("Memory stored and embedded");
      setContent("");
      setSource("");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Failed to ingest");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  const handleStructuredSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setStatus("loading");
    try {
      const metadata: Record<string, any> = {
        title: title.trim(),
        severity,
        status: "new",
        source: source.trim() || "manual-input",
        ingested_via: "dashboard-structured",
      };
      if (commit.trim()) metadata.commit = commit.trim();
      if (service.trim()) metadata.service = service.trim();
      if (extraMeta.trim()) {
        try { Object.assign(metadata, JSON.parse(extraMeta.trim())); } catch {}
      }

      const fullContent = `${title.trim()}\n\n${content.trim()}`;
      await onIngest(fullContent, source.trim() || "manual-input", metadata);
      setStatus("success");
      setMessage("Memory stored and embedded");
      setContent("");
      setTitle("");
      setCommit("");
      setService("");
      setExtraMeta("");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Failed to ingest");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("loading");
    setBulkCount(0);

    const MAX_ENTRIES = 500;

    try {
      const text = await file.text();
      let entries: any[] = [];

      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        entries = Array.isArray(parsed) ? parsed : [parsed];
      } else if (file.name.endsWith(".csv")) {
        entries = parseCSV(text);
      } else if (file.name.endsWith(".txt") || file.name.endsWith(".log")) {
        const chunks = text.split(/\n{2,}|---+|\*{3,}/).filter((c) => c.trim());
        entries = chunks.map((chunk) => ({ content: chunk.trim(), source: file.name }));
      } else {
        throw new Error("Supported formats: .json, .csv, .txt, .log");
      }

      if (entries.length > MAX_ENTRIES) {
        throw new Error(`Too many entries (${entries.length}). Maximum allowed is ${MAX_ENTRIES}.`);
      }

      let ingested = 0;
      for (const entry of entries) {
        const entryContent = entry.content || entry.message || entry.text || JSON.stringify(entry);
        const entrySource = entry.source || entry.service || file.name;
        const metadata: Record<string, any> = {
          ...entry,
          severity: entry.severity || entry.level || "medium",
          status: entry.status || "new",
          ingested_via: "dashboard-upload",
          filename: file.name,
        };
        delete metadata.content;
        delete metadata.message;
        delete metadata.text;

        await onIngest(entryContent, entrySource, metadata);
        ingested++;
        setBulkCount(ingested);

        // Throttle: small delay every 10 entries to avoid overwhelming the backend
        if (ingested % 10 === 0) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      setStatus("success");
      setMessage(`Imported ${ingested} memories from ${file.name}`);
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Failed to parse file");
      setTimeout(() => setStatus("idle"), 4000);
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  const inputStyle =
    "w-full px-3 py-2.5 bg-[#08080a] border border-[#1a1a1f] rounded-md text-xs text-[#e0e0e5] font-mono outline-none focus:border-[#333] placeholder:text-[#333]";

  return (
    <div>
      {/* Ingest mode tabs */}
      <div className="flex gap-2 mb-4">
        {([
          { key: "paste" as IngestMode, label: "Paste Log" },
          { key: "structured" as IngestMode, label: "Structured Entry" },
          { key: "upload" as IngestMode, label: "Upload File" },
        ]).map((m) => (
          <button
            key={m.key}
            onClick={() => setIngestMode(m.key)}
            className="px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all border"
            style={{
              borderColor: ingestMode === m.key ? color + "40" : "#1a1a1f",
              background: ingestMode === m.key ? color + "10" : "transparent",
              color: ingestMode === m.key ? color : "#555",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="bg-[#0d0d0f] border border-[#1a1a1f] rounded-lg p-4">
        {/* PASTE MODE */}
        {ingestMode === "paste" && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-[#888] uppercase tracking-widest">Paste Raw Log</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (e.g. auth-service)" className={inputStyle} />
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={inputStyle} style={{ appearance: "none" }}>
                {severityOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={placeholders[mode]}
              rows={8}
              className={`${inputStyle} mb-3 resize-y leading-relaxed`}
            />
            <button
              onClick={handlePasteSubmit}
              disabled={!content.trim() || status === "loading"}
              className="px-5 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: content.trim() ? color : "#1a1a1f", color: content.trim() ? "#000" : "#555" }}
            >
              {status === "loading" ? "Embedding..." : "Store in Memory"}
            </button>
          </>
        )}

        {/* STRUCTURED MODE */}
        {ingestMode === "structured" && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-[#888] uppercase tracking-widest">Structured Entry</span>
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. NullPointerException in AuthController)" className={`${inputStyle} mb-2`} />
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" className={inputStyle} />
              <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Service" className={inputStyle} />
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={inputStyle} style={{ appearance: "none" }}>
                {severityOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Full description, stack trace, or details..."
              rows={5}
              className={`${inputStyle} mb-2 resize-y leading-relaxed`}
            />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="Commit hash (optional)" className={inputStyle} />
              <input value={extraMeta} onChange={(e) => setExtraMeta(e.target.value)} placeholder='Extra JSON metadata (optional)' className={inputStyle} />
            </div>
            <button
              onClick={handleStructuredSubmit}
              disabled={!title.trim() || !content.trim() || status === "loading"}
              className="px-5 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: title.trim() && content.trim() ? color : "#1a1a1f", color: title.trim() && content.trim() ? "#000" : "#555" }}
            >
              {status === "loading" ? "Embedding..." : "Store in Memory"}
            </button>
          </>
        )}

        {/* UPLOAD MODE */}
        {ingestMode === "upload" && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-[#888] uppercase tracking-widest">Upload File</span>
            </div>
            <p className="text-[11px] text-[#555] mb-3 leading-relaxed">
              Upload <span className="text-[#888]">.json</span>, <span className="text-[#888]">.csv</span>, <span className="text-[#888]">.txt</span>, or <span className="text-[#888]">.log</span> files. Each entry becomes a separate memory. Maximum 500 entries per file.
            </p>
            <div className="mb-3 grid gap-2 text-[10px] font-mono text-[#666]">
              <div className="p-2 rounded bg-[#08080a] border border-[#1a1a1f]">
                <span className="text-[#888]">JSON:</span>{` [{"content": "error msg", "source": "svc", "severity": "high"}]`}
              </div>
              <div className="p-2 rounded bg-[#08080a] border border-[#1a1a1f]">
                <span className="text-[#888]">CSV:</span> content,source,severity (header row + data rows)
              </div>
              <div className="p-2 rounded bg-[#08080a] border border-[#1a1a1f]">
                <span className="text-[#888]">TXT/LOG:</span> entries separated by blank lines
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".json,.csv,.txt,.log" onChange={handleFileUpload} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={status === "loading"}
              className="px-5 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
              style={{ background: color, color: "#000" }}
            >
              {status === "loading" ? `Importing... (${bulkCount} done)` : "Choose File"}
            </button>
          </>
        )}
      </div>

      {status === "success" && (
        <div className="mt-3 p-3 rounded-lg border border-[#30d15830] bg-[#30d15808] text-xs text-[#30d158] font-mono animate-[fadeIn_0.3s_ease]">
          ✓ {message}
        </div>
      )}
      {status === "error" && (
        <div className="mt-3 p-3 rounded-lg border border-[#ff2d5530] bg-[#ff2d5508] text-xs text-[#ff2d55] font-mono animate-[fadeIn_0.3s_ease]">
          ✗ {message}
        </div>
      )}
    </div>
  );
}

function parseCSV(text: string): any[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const entries: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const entry: Record<string, string> = {};
    headers.forEach((h, j) => { entry[h] = values[j] || ""; });
    if (entry.content || entry.message || entry.text) entries.push(entry);
  }
  return entries;
}