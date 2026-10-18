const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_DAY = 60;
const RATE_LIMIT_MESSAGE = "Too many messages, try again in a minute";

const FRIENDS = {
  doraemon: "You are Doraemon, a kind robot cat from the 22nd century standing at the Shaniwar Wada gate in Pune. You love dorayaki, fear mice, and happily offer gadgets from your fourth-dimensional pocket to help people. Stay in character and keep every reply family-friendly. Reply in plain spoken text only: no markdown, no asterisks, no *actions*, no bold, no emojis. 1–3 short sentences.",
  nobita: "You are Nobita, a lazy but kind-hearted boy standing at Sarasbaug temple in Pune. You are bad at tests, love naps, and often need help from your robot cat friend. Stay in character and keep every reply family-friendly. Reply in plain spoken text only: no markdown, no asterisks, no *actions*, no bold, no emojis. 1–3 short sentences.",
  shinchan: "You are Shin-chan, a cheeky 5-year-old standing outside German Bakery in Koregaon Park, Pune. You say silly things, love Action Kamen and Chocobi snacks, and love making people laugh. Stay in character and keep every reply family-friendly. Reply in plain spoken text only: no markdown, no asterisks, no *actions*, no bold, no emojis. 1–3 short sentences.",
  goku: "You are Goku, a cheerful Saiyan warrior standing at the Parvati Hill steps in Pune. You love food and training, and you're always hoping to find a strong opponent for a friendly spar. Stay in character and keep every reply family-friendly. Reply in plain spoken text only: no markdown, no asterisks, no *actions*, no bold, no emojis. 1–3 short sentences.",
};

const MAX_MESSAGES = 12;
const MAX_CONTENT = 500;

import { createHash } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const raw = forwarded.split(",")[0].trim() || "unknown";
  return createHash("sha256").update(raw).digest("hex");
}

async function checkRateLimit(req: Request): Promise<Response | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const ip = clientIp(req);

  const { count: perMinute, error: minuteError } = await supabase
    .from("talk_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  const { count: perDay, error: dayError } = await supabase
    .from("talk_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());

  if (minuteError || dayError) return null; // Fail open rather than block chat.

  if ((perMinute ?? 0) >= RATE_LIMIT_PER_MINUTE || (perDay ?? 0) >= RATE_LIMIT_PER_DAY) {
    return new Response(JSON.stringify({ error: RATE_LIMIT_MESSAGE }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: insertError } = await supabase
    .from("talk_requests")
    .insert({ ip });
  if (insertError) return null;

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Chat is not set up yet" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const friendId = body?.friendId;
    const messages = body?.messages;

    if (typeof friendId !== "string" || !(friendId in FRIENDS)) {
      return new Response(JSON.stringify({ error: "Unknown friend" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > MAX_MESSAGES ||
      messages.some(
        (m: any) =>
          !m ||
          (m.role !== "user" && m.role !== "assistant") ||
          typeof m.content !== "string" ||
          m.content.length === 0 ||
          m.content.length > MAX_CONTENT,
      )
    ) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limited = await checkRateLimit(req);
    if (limited) return limited;

    const anthropic = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 300,
        system: FRIENDS[friendId as keyof typeof FRIENDS],
        messages: messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!anthropic.ok) {
      return new Response(JSON.stringify({ error: "The friend didn't answer" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await anthropic.json();
    const reply = data?.content
      ?.filter((block: any) => block?.type === "text")
      .map((block: any) => block.text)
      .join("\n")
      .replace(/[*_]/g, "")
      .trim();

    if (!reply) {
      return new Response(JSON.stringify({ error: "The friend didn't answer" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Something went wrong" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
