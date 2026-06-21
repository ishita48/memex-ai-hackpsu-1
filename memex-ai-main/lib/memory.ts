import { openai } from "./openai";
import { supabase } from "./supabase";
import type {
  IngestPayload,
  IngestResult,
  Memory,
  Incident,
  QueryResult,
} from "@/types";
import { randomUUID } from "crypto";

// ─── RATE LIMITER ──────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_INGEST = 30; // max ingest calls per IP per minute
const RATE_LIMIT_MAX_QUERY = 20; // max query calls per IP per minute

function checkRateLimit(
  key: string,
  maxRequests: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Periodically clean up expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Rate limit exceeded. Retry after ${Math.ceil(retryAfterMs / 1000)} seconds.`);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── EMBED ─────────────────────────────────────────────────────
async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

// ─── INGEST (with incident clustering + alerts) ────────────────
export async function ingest(
  entry: IngestPayload,
  clientIp: string = "global"
): Promise<IngestResult> {
  const rateLimitKey = `ingest:${clientIp}`;
  const { allowed, retryAfterMs } = checkRateLimit(
    rateLimitKey,
    RATE_LIMIT_MAX_INGEST
  );
  if (!allowed) {
    throw new RateLimitError(retryAfterMs);
  }

  const embedding = await embed(entry.content);

  let incident_id = randomUUID();
  let is_new_incident = true;

  const { data: similar } = await supabase.rpc("find_similar_memory", {
    query_embedding: embedding,
    similarity_threshold: 0.82,
    filter_type: entry.type,
  });

  if (similar && similar.length > 0 && similar[0].incident_id) {
    incident_id = similar[0].incident_id;
    is_new_incident = false;

    await supabase
      .from("incidents")
      .update({
        last_seen: new Date().toISOString(),
        severity: entry.metadata.severity || "medium",
      })
      .eq("id", incident_id);
  } else {
    const title =
      entry.metadata.title ||
      entry.content.slice(0, 120).split("\n")[0];

    await supabase.from("incidents").insert({
      id: incident_id,
      type: entry.type,
      title,
      severity: entry.metadata.severity || "medium",
      status: "open",
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      metadata: { source: entry.source },
    });
  }

  const { data, error } = await supabase
    .from("memories")
    .insert({
      type: entry.type,
      source: entry.source,
      content: entry.content,
      metadata: entry.metadata,
      embedding,
      incident_id,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Ingest failed: ${error.message}`);

  let alert_triggered = false;
  const sev = (entry.metadata.severity || "").toLowerCase();
  if (sev === "critical" || sev === "high") {
    await supabase.from("alerts").insert({
      incident_id,
      memory_id: data.id,
      severity: sev,
      title: entry.metadata.title || entry.content.slice(0, 80),
      message: `${sev.toUpperCase()} severity event from ${entry.source}`,
    });
    alert_triggered = true;
  }

  return { id: data.id, incident_id, is_new_incident, alert_triggered };
}

// ─── QUERY (hybrid search + reasoning + patterns) ──────────────
export async function query(
  question: string,
  mode: string,
  matchCount: number = 10,
  threshold: number = 0.25,
  clientIp: string = "global"
): Promise<QueryResult> {
  const rateLimitKey = `query:${clientIp}`;
  const { allowed, retryAfterMs } = checkRateLimit(
    rateLimitKey,
    RATE_LIMIT_MAX_QUERY
  );
  if (!allowed) {
    throw new RateLimitError(retryAfterMs);
  }

  const queryEmbedding = await embed(question);
  const filterType =
    mode === "sentry" ? "error" : mode === "comcast" ? "network" : "api";

  const { data: results, error } = await supabase.rpc(
    "match_memories_hybrid",
    {
      query_embedding: queryEmbedding,
      query_text: question,
      match_threshold: threshold,
      match_count: matchCount,
      filter_type: filterType,
    }
  );

  if (error) throw new Error(`Query failed: ${error.message}`);

  if (!results || results.length === 0) {
    return {
      results: [],
      reasoning:
        "No matching memories found. Ingest this incident to build memory for future debugging.",
    };
  }

  const now = Date.now();
  const reranked = results
    .map((r: any) => {
      const hoursOld =
        (now - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
      const recencyBoost = Math.exp(-hoursOld / 168);
      const feedbackBoost = (r.feedback_score || 0) * 0.05;
      return {
        ...r,
        similarity: Math.min(
          0.99,
          r.similarity + feedbackBoost + recencyBoost * 0.1
        ),
      };
    })
    .sort((a: any, b: any) => b.similarity - a.similarity);

  const reasoning = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: `You are Memex AI, an incident intelligence system. Given retrieved logs and a question, provide analysis in this exact format:

**Root Cause:** [1 sentence identifying the most likely root cause]
**Impact:** [1 sentence on what was affected]  
**Fix:** [1 sentence with the specific fix or recommended action]
**Pattern:** [1 sentence — if multiple similar events exist, describe the recurring pattern. If not, say "First occurrence — no pattern detected yet."]

Be concrete and technical. Reference specific services, commits, metrics, and timestamps when available. Never use filler words.`,
      },
      {
        role: "user",
        content: `Question: ${question}\n\nRetrieved (${reranked.length} results):\n${JSON.stringify(
          reranked.slice(0, 5),
          null,
          2
        )}`,
      },
    ],
  });

  const incidentIds = [
    ...new Set(reranked.map((r: any) => r.incident_id).filter(Boolean)),
  ];
  let pattern: string | undefined;
  if (incidentIds.length > 0) {
    const { data: incidentData } = await supabase
      .from("incidents")
      .select("*")
      .in("id", incidentIds.slice(0, 3));
    if (incidentData && incidentData.length > 1) {
      pattern = `${incidentData.length} related incidents detected spanning ${formatSpan(incidentData)}`;
    }
  }

  return {
    results: reranked,
    reasoning:
      reasoning.choices[0].message.content || "No reasoning generated.",
    pattern,
  };
}

// ─── BROWSE ────────────────────────────────────────────────────
export async function browse(
  type: string,
  limit: number = 20
): Promise<Memory[]> {
  const filterType =
    type === "sentry" ? "error" : type === "comcast" ? "network" : "api";

  const { data, error } = await supabase
    .from("memories")
    .select(
      "id, type, source, content, metadata, incident_id, feedback_score, resolved, created_at"
    )
    .eq("type", filterType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Browse failed: ${error.message}`);
  return data as Memory[];
}

// ─── INCIDENTS ─────────────────────────────────────────────────
export async function getIncidents(
  mode: string,
  status?: string
): Promise<Incident[]> {
  const filterType =
    mode === "sentry" ? "error" : mode === "comcast" ? "network" : "api";

  const { data, error } = await supabase.rpc("get_incidents", {
    filter_type: filterType,
    filter_status: status || null,
    result_limit: 20,
  });

  if (error) throw new Error(`Incidents failed: ${error.message}`);
  return data as Incident[];
}

export async function getIncidentMemories(
  incidentId: string
): Promise<Memory[]> {
  const { data, error } = await supabase
    .from("memories")
    .select(
      "id, type, source, content, metadata, incident_id, feedback_score, resolved, created_at"
    )
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Incident memories failed: ${error.message}`);
  return data as Memory[];
}

export async function updateIncidentStatus(
  incidentId: string,
  status: string,
  rootCause?: string,
  fix?: string
): Promise<void> {
  const update: Record<string, any> = { status };
  if (rootCause) update.root_cause = rootCause;
  if (fix) update.fix = fix;

  const { error } = await supabase
    .from("incidents")
    .update(update)
    .eq("id", incidentId);

  if (error) throw new Error(`Update failed: ${error.message}`);
}

// ─── FEEDBACK ──────────────────────────────────────────────────
export async function submitFeedback(
  memoryId: string,
  delta: number
): Promise<void> {
  const { data } = await supabase
    .from("memories")
    .select("feedback_score")
    .eq("id", memoryId)
    .single();

  const current = data?.feedback_score || 0;

  const { error } = await supabase
    .from("memories")
    .update({ feedback_score: current + delta })
    .eq("id", memoryId);

  if (error) throw new Error(`Feedback failed: ${error.message}`);
}

// ─── ALERTS ────────────────────────────────────────────────────
export async function getAlerts(
  acknowledged?: boolean
): Promise<any[]> {
  let q = supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (acknowledged !== undefined) {
    q = q.eq("acknowledged", acknowledged);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Alerts failed: ${error.message}`);
  return data;
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  const { error } = await supabase
    .from("alerts")
    .update({ acknowledged: true })
    .eq("id", alertId);

  if (error) throw new Error(`Ack failed: ${error.message}`);
}

// ─── RESOLVE MEMORY ────────────────────────────────────────────
export async function resolveMemory(
  memoryId: string,
  resolvedBy?: string
): Promise<void> {
  const { error } = await supabase
    .from("memories")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy || "dashboard",
    })
    .eq("id", memoryId);

  if (error) throw new Error(`Resolve failed: ${error.message}`);
}

// ─── HELPERS ───────────────────────────────────────────────────
function formatSpan(incidents: any[]): string {
  const dates = incidents.map((i) => new Date(i.first_seen).getTime());
  const earliest = new Date(Math.min(...dates));
  const latest = new Date(Math.max(...dates));
  const diffH = (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60);
  if (diffH < 24) return `${Math.round(diffH)} hours`;
  return `${Math.round(diffH / 24)} days`;
}