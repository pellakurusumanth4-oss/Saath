// The website's talk function: a shop's mascot answers about its shop from the shop's live data, and speaks in its own
// stock ElevenLabs voice. The mascots' rules, personalities and voices are web/talk's (prompts.mjs, reply.mjs: copies
// here, kept in step by site/scripts/sync-ar-function.mjs), the same as in AR. Keys are Supabase secrets, never in code.
import { createHash } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";
import { MASCOT_RULES, MASCOTS, mascotOf, mascotPrompt, shopData } from "./prompts.mjs";
import { redact, replyParser, wantsToListen } from "./reply.mjs";
import { loadShop } from "./shop.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_PER_DAY = 1000; // owner pays for the hackathon demo; key is removed after judging
const RATE_LIMIT_MESSAGE = "Too many messages, try again in a minute";

// Neutral settings, as in web/talk/server.mjs, so each voice keeps its own character.
const ELEVEN_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: false, speed: 1 };
const MAX_SPEAK_CHARS = 1200; // a story reply runs to about 1,000 characters
const MAX_MESSAGES = 12;
const MAX_CONTENT = 500;
const MAX_REPLY = 1200; // the mascot's own earlier replies, as in the ar function

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const raw = forwarded.split(",")[0].trim() || "unknown";
  return createHash("sha256").update(raw).digest("hex");
}

async function checkRateLimit(req: Request): Promise<Response | null> {
  const ip = clientIp(req);

  const { count: perMinute, error: minuteError } = await db
    .from("talk_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  const { count: perDay, error: dayError } = await db
    .from("talk_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (minuteError || dayError) return null; // Fail open rather than block chat.

  if ((perMinute ?? 0) >= RATE_LIMIT_PER_MINUTE || (perDay ?? 0) >= RATE_LIMIT_PER_DAY) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429);
  }

  const { error: insertError } = await db.from("talk_requests").insert({ ip });
  if (insertError) return null;

  return null;
}

type Message = { role: "user" | "assistant"; content: string };

const validMessages = (messages: unknown): messages is Message[] =>
  Array.isArray(messages) &&
  messages.length > 0 &&
  messages.length <= MAX_MESSAGES &&
  messages.every(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length > 0 &&
      m.content.length <= (m.role === "assistant" ? MAX_REPLY : MAX_CONTENT),
  ) &&
  messages[messages.length - 1].role === "user";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Chat is not set up yet" }, 500);

    const body = await req.json().catch(() => null);
    const mode = body?.mode;

    // ---- Voice: is ElevenLabs set up? (free, not rate limited) ----
    if (mode === "voice-status") {
      return json({ eleven: !!Deno.env.get("ELEVENLABS_API_KEY") });
    }

    // ---- Voice: speak one of a mascot's lines in its own stock voice, returns audio/mpeg ----
    if (mode === "speak") {
      const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
      if (!elevenKey) return json({ error: "Voice is not set up" }, 503);
      const friendId = body?.friendId;
      const text = body?.text;
      const voices: Record<string, { voice: string }> = MASCOTS;
      const defaultVoice = typeof friendId === "string" && Object.hasOwn(voices, friendId) ? voices[friendId].voice : undefined;
      if (!defaultVoice || typeof text !== "string" || text.trim().length === 0 || text.length > MAX_SPEAK_CHARS) {
        return json({ error: "Invalid voice request" }, 400);
      }
      const limited = await checkRateLimit(req);
      if (limited) return limited;

      const voiceId = Deno.env.get(`ELEVENLABS_VOICE_${friendId.toUpperCase()}`) || defaultVoice;
      const tts = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
        {
          method: "POST",
          headers: { "xi-api-key": elevenKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({
            text: text.trim(),
            model_id: "eleven_flash_v2_5",
            voice_settings: ELEVEN_SETTINGS,
          }),
        },
      );
      if (!tts.ok) {
        console.error("ElevenLabs failed", tts.status, (await tts.text()).slice(0, 300));
        return json({ error: "Voice failed", status: tts.status }, 502);
      }
      return new Response(tts.body, { headers: { ...corsHeaders, "Content-Type": "audio/mpeg" } });
    }

    // ---- A shop's mascot answers from the shop's live data (the page sends only the shop's slug) ----
    const messages = body?.messages;
    if (typeof body?.shop !== "string" || !validMessages(messages)) return json({ error: "Send a shop and messages" }, 400);

    const limited = await checkRateLimit(req);
    if (limited) return limited;

    const shop = await loadShop(db, body.shop);
    if (!shop) return json({ error: "Unknown shop" }, 404);
    let system;
    try {
      system = [
        { type: "text", text: MASCOT_RULES },
        { type: "text", text: mascotPrompt(shop), cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: shopData(shop) },
      ];
    } catch (err) {
      console.error(`shop ${shop.id}: ${err instanceof Error ? err.message : err}`);
      return json({ error: "The mascot didn't answer" }, 500);
    }

    // The model must see a user turn first; numbers and emails visitors type never reach it.
    const history = messages.map((m) => ({ role: m.role, content: m.role === "user" ? redact(m.content) : m.content }));
    while (history[0]?.role === "assistant") history.shift();

    const anthropic = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        max_tokens: 400,
        system,
        messages: history,
      }),
    });
    if (!anthropic.ok) {
      console.error("Claude failed", anthropic.status, (await anthropic.text()).slice(0, 300));
      return json({ error: "The mascot didn't answer" }, 502);
    }

    const data = await anthropic.json();
    const rawReply: string = data?.content?.filter((block: { type?: string }) => block?.type === "text")
      .map((block: { text: string }) => block.text).join("\n") ?? "";
    // The same checks as in AR: the [emotion|action] tag off, at most 5 sentences, and no unsafe sentence spoken.
    const said: string[] = [];
    const parser = replyParser(mascotOf(shop).actions, { onCue: () => {}, onSentence: (s: string) => said.push(s) },
      { listening: wantsToListen(history[history.length - 1].content) });
    parser.push(rawReply);
    parser.end();
    if (!said.length) return json({ error: "The mascot didn't answer" }, 502);

    return json({ reply: said.join(" ") });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
  }
});
