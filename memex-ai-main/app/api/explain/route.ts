import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.ip ?? req.headers.get("x-forwarded-for") ?? "unknown";
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { code, filename, language, type } = await req.json();

    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    let systemPrompt = "";

    if (type === "error") {
      systemPrompt = `You are a senior debugging assistant. The user has an error or exception. Explain in this format:

**What this means:** [1-2 sentences in plain English]
**Why it happened:** [1-2 sentences on the root cause]
**How to fix it:** [Show the corrected code or exact steps]
**How to prevent it:** [1 sentence on best practice]

Be concrete. Show actual code fixes. No filler words.`;
    } else if (type === "line") {
      systemPrompt = `You are a senior code explainer. The user wants to understand a line of code. Explain in this format:

**What this does:** [1-2 sentences explaining the line]
**How it works:** [Brief technical breakdown]
**Potential issues:** [Any bugs, edge cases, or improvements — or "None" if clean]
**Best practice:** [1 sentence suggestion if applicable]

Be concrete and concise. No filler words.`;
    } else {
      systemPrompt = `You are a senior developer assistant. Explain the following code clearly and concisely. Include what it does, any issues, and suggestions for improvement.`;
    }

    const userContent = type === "line"
      ? `File: ${filename || "unknown"}\nLanguage: ${language || "unknown"}\n\nLine:\n${code}`
      : `File: ${filename || "unknown"}\nLanguage: ${language || "unknown"}\n\nError/Code:\n${code}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const explanation = response.choices[0].message.content || "Could not generate explanation.";

    return NextResponse.json({ explanation });
  } catch (err: any) {
    console.error("[explain] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}