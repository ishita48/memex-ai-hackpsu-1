import { NextRequest, NextResponse } from "next/server";
import { ingest } from "@/lib/memory";
import { validateApiKey } from "@/lib/api-auth";

// ─── SEED DATA ─────────────────────────────────────────────────
// These are the 15 preloaded memories across all 3 sponsor modes.
// Run this ONCE to populate your DB before demo day.

const SEED_DATA = [
  // ── SENTRY (errors) ──
  {
    type: "error" as const,
    source: "auth-service",
    content:
      "java.lang.NullPointerException at com.memex.auth.AuthController.validateToken(AuthController.java:142). User session expired mid-request during token refresh cycle. Fix: added null-safe optional chaining and session fallback in commit a3f9b2c.",
    metadata: {
      severity: "critical",
      service: "auth-service",
      language: "Java",
      commit: "a3f9b2c",
      status: "resolved",
      title: "NullPointerException in AuthController.java:142",
    },
  },
  {
    type: "error" as const,
    source: "payment-gateway",
    content:
      "Connection timeout after 30s on POST /webhooks/stripe. Retry queue backed up to 847 events. Root cause: connection pool exhaustion from leaked HTTP clients. Fix: implemented connection pooling with max 50 clients in commit d7e1f0a.",
    metadata: {
      severity: "high",
      service: "payment-gateway",
      language: "TypeScript",
      commit: "d7e1f0a",
      status: "resolved",
      title: "TimeoutException: Stripe webhook delivery failed",
    },
  },
  {
    type: "error" as const,
    source: "user-service",
    content:
      "Node.js process heap grew to 847MB over 6 hours. Event listeners on WebSocket connections not cleaned up on disconnect. Fix: added removeAllListeners() in socket close handler, commit b2c8d3e.",
    metadata: {
      severity: "high",
      service: "user-service",
      language: "Node.js",
      commit: "b2c8d3e",
      status: "resolved",
      title: "MemoryLeakDetected: heap exceeds 512MB threshold",
    },
  },
  {
    type: "error" as const,
    source: "api-gateway",
    content:
      "Burst traffic from mobile client v3.2.1 caused rate limit breach on /api/v2/search at 1000 req/min. Client was retrying failed requests without exponential backoff. Fix: patched client SDK with jittered retry in commit f4a9c1b.",
    metadata: {
      severity: "medium",
      service: "api-gateway",
      language: "Go",
      commit: "f4a9c1b",
      status: "resolved",
      title: "RateLimitExceeded: /api/v2/search hit 1000 req/min",
    },
  },
  {
    type: "error" as const,
    source: "db-connector",
    content:
      "PostgreSQL deadlock detected on concurrent UPDATE to orders table. Two transactions acquired row locks in opposite order. Fix: enforced consistent lock ordering by primary key in commit e9d2a7f.",
    metadata: {
      severity: "critical",
      service: "db-connector",
      language: "Python",
      commit: "e9d2a7f",
      status: "resolved",
      title: "DeadlockException in transaction batch processor",
    },
  },

  // ── COMCAST (network) ──
  {
    type: "network" as const,
    source: "region-northeast",
    content:
      "Nightly bandwidth surge detected across northeast corridor. Peak at 9:10 PM correlated with streaming service releases (Netflix, Disney+). Pattern repeats every Tuesday/Friday. Predicted next occurrence: tonight at 9:10 PM EST.",
    metadata: {
      region: "northeast",
      metric: "bandwidth",
      peak: "9:10 PM",
      pattern: "recurring",
      confidence: "94%",
      title: "Bandwidth spike: 340% above baseline at 9:10 PM EST",
    },
  },
  {
    type: "network" as const,
    source: "node-chi-042",
    content:
      "Sustained latency spike on Chicago distribution node. BGP route flapping caused traffic rerouting through Dallas. Resolved after upstream provider stabilized peering. Duration: 47 minutes.",
    metadata: {
      region: "midwest",
      metric: "latency",
      duration: "47min",
      impact: "12,400 customers",
      status: "resolved",
      title: "Latency anomaly: Chicago node 42 — 340ms avg",
    },
  },
  {
    type: "network" as const,
    source: "dns-cluster-east",
    content:
      "DNS cluster east experienced cascading failures after config push. TTL values set to 0 caused thundering herd on resolvers. Fix: rolled back config, implemented canary deployments for DNS changes.",
    metadata: {
      region: "east",
      metric: "dns",
      error_rate: "2.3%",
      customers_affected: "89,000",
      status: "resolved",
      title: "DNS resolution failures: 2.3% error rate",
    },
  },
  {
    type: "network" as const,
    source: "fiber-corridor-7",
    content:
      "Physical layer degradation on fiber segment between Philadelphia and Newark. SFP transceiver approaching end-of-life with declining optical power. Scheduled replacement resolved issue.",
    metadata: {
      region: "northeast",
      metric: "packet_loss",
      delivery_rate: "94.2%",
      status: "resolved",
      title: "Packet loss: Fiber corridor 7 degraded to 94.2% delivery",
    },
  },
  {
    type: "network" as const,
    source: "capacity-planner",
    content:
      "Southeast region approaching capacity ceiling. Growth trend projects 95% utilization within 60 days. Recommendation: provision additional 40Gbps capacity at Atlanta and Miami POPs.",
    metadata: {
      region: "southeast",
      metric: "capacity",
      utilization: "87%",
      projection: "95% in 60 days",
      status: "active",
      title: "Capacity warning: Southeast region at 87% utilization",
    },
  },

  // ── BASE44 (api/infra) ──
  {
    type: "api" as const,
    source: "deploy-pipeline",
    content:
      "Deploy v2.14.0 introduced users_v3 schema that dropped NOT NULL on email column. Downstream services crashed on null email reads. Auto-rollback triggered. This is the 2nd schema incident this month — recommend adding CI schema validation.",
    metadata: {
      deploy: "v2.14.0",
      service: "deploy-pipeline",
      rollback: true,
      incident_count: "2 this month",
      status: "rolled back",
      title: "Schema migration rollback: users_v3 broke FK constraints",
    },
  },
  {
    type: "api" as const,
    source: "endpoint-monitor",
    content:
      "Orders endpoint performance degradation traced to missing index on orders.created_at after migration. Query plan switched from index scan to sequential scan on 2.3M row table. Fix: CREATE INDEX CONCURRENTLY on created_at.",
    metadata: {
      endpoint: "/api/v2/orders",
      p99_before: "120ms",
      p99_after: "2.4s",
      root_cause: "missing index",
      status: "resolved",
      title: "POST /api/v2/orders: p99 latency jumped to 2.4s",
    },
  },
  {
    type: "api" as const,
    source: "health-check",
    content:
      "Inventory service failed health checks for 3 consecutive intervals. Root cause: Kubernetes pod OOMKilled due to memory limit set too low (256Mi) for new caching feature. Fix: bumped to 512Mi, added memory profiling.",
    metadata: {
      service: "inventory-service",
      cause: "OOMKilled",
      memory_limit: "256Mi → 512Mi",
      downtime: "8 min",
      status: "resolved",
      title: "Circuit breaker tripped: inventory-service unreachable",
    },
  },
  {
    type: "api" as const,
    source: "rate-limiter",
    content:
      "Production API key leaked in public GitHub repo. Automated scraper hit /api/v2/users at 5K req/min. Key revoked, IP blocked, added GitHub secret scanning to CI pipeline.",
    metadata: {
      key: "key_prod_x7f",
      requests: "50K in 10min",
      source_leak: "GitHub",
      status: "mitigated",
      title: "API key abuse: key_prod_x7f exceeded 50K requests",
    },
  },
  {
    type: "api" as const,
    source: "webhook-relay",
    content:
      "Webhook consumer fell behind after downstream partner rate-limited responses. Queue depth grew from 0 to 12,847 in 2 hours. Implemented adaptive throttling with partner-specific rate limits.",
    metadata: {
      queue_depth: "12,847",
      cause: "partner rate limiting",
      resolution: "adaptive throttling",
      status: "resolved",
      title: "Webhook delivery backlog: 12,847 events pending",
    },
  },
];

// ─── API ROUTE (hit /api/seed to populate) ─────────────────────
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (auth.error) return auth.error;

  try {
    const results = [];

    for (const entry of SEED_DATA) {
      const result = await ingest(entry);
      results.push({ id: result.id, source: entry.source, type: entry.type });
      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      entries: results,
      message: `Seeded ${results.length} memories across sentry/comcast/base44 modes`,
    });
  } catch (err: any) {
    console.error("[seed] Error:", err);
    return NextResponse.json(
      { error: err.message || "Seed failed" },
      { status: 500 }
    );
  }
}