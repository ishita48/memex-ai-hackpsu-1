const BASE_URL = "http://localhost:3000";

const ALL_LOGS = [
  {
    type: "error", source: "auth-service",
    content: "java.lang.NullPointerException at AuthController.validateToken(AuthController.java:142). User session expired mid-request during token refresh.",
    metadata: { severity: "critical", service: "auth-service", title: "NullPointerException in AuthController" },
  },
  {
    type: "error", source: "payment-gateway",
    content: "Connection timeout after 30s on POST /webhooks/stripe. Retry queue backed up. Root cause: connection pool exhaustion.",
    metadata: { severity: "high", service: "payment-gateway", title: "Stripe webhook timeout" },
  },
  {
    type: "error", source: "user-service",
    content: "Node.js process heap grew to 847MB over 6 hours. Event listeners on WebSocket connections not cleaned up on disconnect.",
    metadata: { severity: "high", service: "user-service", title: "Memory leak: heap exceeds 512MB" },
  },
  {
    type: "error", source: "api-gateway",
    content: "Rate limit exceeded on /api/v2/search — 1000 req/min from mobile client v3.2.1.",
    metadata: { severity: "medium", service: "api-gateway", title: "Rate limit breach on search endpoint" },
  },
  {
    type: "error", source: "db-connector",
    content: "PostgreSQL deadlock detected on concurrent UPDATE to orders table.",
    metadata: { severity: "critical", service: "db-connector", title: "Deadlock in transaction batch processor" },
  },
  {
    type: "network", source: "region-northeast",
    content: "Nightly bandwidth surge detected across northeast corridor. Peak at 9:10 PM.",
    metadata: { region: "northeast", severity: "high", title: "Bandwidth spike 340% above baseline" },
  },
  {
    type: "network", source: "node-chi-042",
    content: "Sustained latency spike on Chicago distribution node. BGP route flapping caused rerouting through Dallas.",
    metadata: { region: "midwest", severity: "high", title: "Chicago node latency anomaly: 340ms" },
  },
  {
    type: "network", source: "dns-cluster-east",
    content: "DNS cluster east cascading failures after config push. TTL set to 0.",
    metadata: { region: "east", severity: "critical", title: "DNS resolution failures: 2.3% error rate" },
  },
  {
    type: "api", source: "deploy-pipeline",
    content: "Deploy v2.14.0 users_v3 schema dropped NOT NULL on email. Downstream services crashed. Auto-rollback triggered.",
    metadata: { deploy: "v2.14.0", severity: "critical", title: "Schema migration rollback" },
  },
  {
    type: "api", source: "endpoint-monitor",
    content: "POST /api/v2/orders p99 latency jumped from 120ms to 2.4s. Missing index on orders.created_at.",
    metadata: { endpoint: "/api/v2/orders", severity: "high", title: "Orders endpoint performance degradation" },
  },
  {
    type: "api", source: "health-check",
    content: "Inventory service failed health checks. Kubernetes pod OOMKilled — memory limit 256Mi too low.",
    metadata: { service: "inventory-service", severity: "high", title: "Circuit breaker: inventory-service down" },
  },
];

async function sendLog() {
  const ingestApiKey = process.env.INGEST_API_KEY;
  if (!ingestApiKey) {
    console.error("Error: INGEST_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const log = ALL_LOGS[Math.floor(Math.random() * ALL_LOGS.length)];
  const variation = {
    ...log,
    content: log.content + ` [${new Date().toISOString()}]`,
    metadata: { ...log.metadata, timestamp: new Date().toISOString(), ingested_via: "stream-simulator" },
  };

  try {
    const res = await fetch(`${BASE_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ingestApiKey}`,
      },
      body: JSON.stringify(variation),
    });
    const data = await res.json();
    const icon = data.is_new_incident ? "🆕" : "🔗";
    const alert = data.alert_triggered ? " 🚨 ALERT" : "";
    console.log(`${icon} [${log.type}] ${log.metadata.title} → incident:${data.incident_id?.slice(0, 8)}${alert}`);
  } catch (err) {
    console.error("Failed:", err.message);
  }
}

console.log("🧠 Memex AI Stream Simulator");
console.log("   Sending logs every 5 seconds... Ctrl+C to stop\n");
sendLog();
setInterval(sendLog, 5000);