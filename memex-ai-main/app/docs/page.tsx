"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ApiDocsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#08080a] text-[#e0e0e5] font-mono p-8 max-w-4xl mx-auto">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');`}</style>

      <div className="mb-12">
        <h1 className="text-2xl font-bold mb-2">
          🧠 Memex AI <span className="text-[#bf5af2]">API</span>
        </h1>
        <p className="text-sm text-[#777]">
          Integrate incident intelligence into any tool, pipeline, or workflow.
        </p>
      </div>

      <Section title="Authentication">
        <p className="text-xs text-[#999] mb-3 leading-relaxed">
          All external API requests require an API key. Pass it via header:
        </p>
        <CodeBlock>{`curl -X POST https://your-app.vercel.app/api/query \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: your-api-key" \\
  -d '{"question": "auth error", "mode": "sentry"}'`}</CodeBlock>
        <p className="text-xs text-[#666] mt-2">
          Also accepts <code className="text-[#bf5af2]">Authorization: Bearer your-api-key</code>
        </p>
      </Section>

      <Section title="POST /api/ingest">
        <p className="text-xs text-[#999] mb-3">
          Store a log, error, or event. Automatically embeds, clusters into incidents, and triggers alerts.
        </p>
        <CodeBlock title="Request">{`{
  "type": "error",           // "error" | "network" | "api"
  "source": "auth-service",  // service or node name
  "content": "NullPointerException at AuthController.java:142...",
  "metadata": {
    "severity": "critical",  // "critical" | "high" | "medium" | "low"
    "service": "auth-service",
    "title": "NullPointerException in AuthController",
    "commit": "a3f9b2c"
  }
}`}</CodeBlock>
        <CodeBlock title="Response">{`{
  "success": true,
  "id": "uuid",
  "incident_id": "uuid",
  "is_new_incident": false,
  "alert_triggered": true,
  "message": "Memory added to existing incident cluster"
}`}</CodeBlock>
      </Section>

      <Section title="POST /api/query">
        <p className="text-xs text-[#999] mb-3">
          Hybrid semantic + keyword search with AI reasoning.
        </p>
        <CodeBlock title="Request">{`{
  "question": "null pointer auth",
  "mode": "sentry"    // "sentry" | "comcast" | "base44"
}`}</CodeBlock>
        <CodeBlock title="Response">{`{
  "results": [
    {
      "id": "uuid",
      "type": "error",
      "source": "auth-service",
      "content": "NullPointerException at AuthController...",
      "metadata": { "severity": "critical", "commit": "a3f9b2c" },
      "incident_id": "uuid",
      "feedback_score": 2,
      "similarity": 0.94,
      "created_at": "2026-03-22T..."
    }
  ],
  "reasoning": "**Root Cause:** Session expiry during token refresh...",
  "pattern": "2 related incidents detected spanning 3 days"
}`}</CodeBlock>
      </Section>

      <Section title="GET /api/incidents">
        <p className="text-xs text-[#999] mb-3">
          List grouped incidents with event counts.
        </p>
        <CodeBlock>{`GET /api/incidents?mode=sentry&status=open
GET /api/incidents?id=<incident-uuid>    // get memories for incident`}</CodeBlock>
        <CodeBlock title="Update status">{`PATCH /api/incidents
{
  "id": "incident-uuid",
  "status": "resolved",
  "root_cause": "Session expiry during token refresh",
  "fix": "Added null-safe chaining in commit a3f9b2c"
}`}</CodeBlock>
      </Section>

      <Section title="POST /api/feedback">
        <p className="text-xs text-[#999] mb-3">
          Rate results to improve future rankings.
        </p>
        <CodeBlock>{`{
  "memory_id": "uuid",
  "action": "helpful"    // "helpful" | "not_helpful" | "resolve"
}`}</CodeBlock>
      </Section>

      <Section title="GET /api/alerts">
        <CodeBlock>{`GET /api/alerts              // all alerts
GET /api/alerts?unread=true  // unacknowledged only

PATCH /api/alerts
{ "id": "alert-uuid" }      // acknowledge`}</CodeBlock>
      </Section>

      <Section title="Integration Examples">
        <CodeBlock title="GitHub Actions — report CI failure">{`# .github/workflows/memex.yml
- name: Report to Memex AI
  if: failure()
  run: |
    curl -X POST $MEMEX_URL/api/ingest \\
      -H "Content-Type: application/json" \\
      -H "x-api-key: $MEMEX_API_KEY" \\
      -d '{
        "type": "error",
        "source": "github-actions",
        "content": "CI failed on $\{{ github.ref }}",
        "metadata": {
          "severity": "high",
          "commit": "$\{{ github.sha }}"
        }
      }'`}</CodeBlock>

        <CodeBlock title="Python SDK">{`import requests

class MemexAI:
    def __init__(self, url, api_key):
        self.url = url
        self.headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key
        }

    def ingest(self, content, source="python", severity="medium", **meta):
        return requests.post(f"{self.url}/api/ingest", json={
            "type": "error",
            "source": source,
            "content": content,
            "metadata": {"severity": severity, **meta}
        }, headers=self.headers).json()

    def query(self, question, mode="sentry"):
        return requests.post(f"{self.url}/api/query", json={
            "question": question,
            "mode": mode
        }, headers=self.headers).json()

# Usage:
memex = MemexAI("https://your-app.vercel.app", "your-key")
memex.ingest("NullPointerException in auth", severity="critical")
result = memex.query("auth error")
print(result["reasoning"])`}</CodeBlock>

        <CodeBlock title="Node.js / JavaScript">{`const MEMEX_URL = "https://your-app.vercel.app";
const MEMEX_KEY = "your-api-key";

async function memexIngest(content, source, severity = "medium") {
  const res = await fetch(MEMEX_URL + "/api/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": MEMEX_KEY,
    },
    body: JSON.stringify({
      type: "error",
      source,
      content,
      metadata: { severity },
    }),
  });
  return res.json();
}

async function memexQuery(question, mode = "sentry") {
  const res = await fetch(MEMEX_URL + "/api/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": MEMEX_KEY,
    },
    body: JSON.stringify({ question, mode }),
  });
  return res.json();
}`}</CodeBlock>
      </Section>

      <div className="mt-12 pt-6 border-t border-[#1a1a1f] text-[10px] text-[#333]">
        MEMEX AI v2.0 — Incident Intelligence Engine
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-sm font-bold text-[#bf5af2] mb-3 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="mb-3">
      {title && (
        <div className="text-[9px] text-[#555] uppercase tracking-widest mb-1">{title}</div>
      )}
      <pre className="bg-[#0d0d0f] border border-[#1a1a1f] rounded-lg p-3 text-[11px] leading-relaxed overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  );
}