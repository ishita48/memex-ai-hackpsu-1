import { NextRequest, NextResponse } from "next/server";
import { ingest } from "@/lib/memory";
import { validateApiKey } from "@/lib/api-auth";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { IngestPayload } from "@/types";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "memex:ingest",
});

export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(req);
    if (auth.error) return auth.error;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    const rateLimitKey = auth.userId ?? ip;
    const { success } = await ratelimit.limit(rateLimitKey);
    if (!success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body: IngestPayload = await req.json();

    if (!body.type || !body.source || !body.content) {
      return NextResponse.json(
        { error: "Missing required fields: type, source, content" },
        { status: 400 }
      );
    }

    if (!["error", "network", "api"].includes(body.type)) {
      return NextResponse.json(
        { error: "type must be 'error', 'network', or 'api'" },
        { status: 400 }
      );
    }

    const result = await ingest(body);

    return NextResponse.json({
      success: true,
      ...result,
      message: result.is_new_incident
        ? "New incident created and memory stored"
        : "Memory added to existing incident cluster",
    });
  } catch (err: any) {
    console.error("[ingest] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}