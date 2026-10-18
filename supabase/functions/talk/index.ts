const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_PER_DAY = 1000; // owner pays for the hackathon demo; key is removed after judging
const RATE_LIMIT_MESSAGE = "Too many messages, try again in a minute";

/**
 * Saath's own character voices, the same ones the phone app uses (web/talk/voices.json):
 * designed from written descriptions with open-source Qwen3-TTS (no real person or actor),
 * then loaded into the owner's ElevenLabs account. Override with ELEVENLABS_VOICE_<FRIEND> secrets.
 */
const ELEVEN_VOICES: Record<string, string> = {
  doraemon: "J0lJebHBcbJXRg92zRzT",
  nobita: "LasN4GAs8M2H8gKwsin9",
  shinchan: "70cqcJftET6PVzXmUJyh",
  goku: "6UA5cRqz08Jse4Dnzk3C",
};
// Neutral settings, as in the app (web/talk/server.mjs), so each designed voice keeps its own character.
const ELEVEN_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: false, speed: 1 };
const MAX_SPEAK_CHARS = 600;

const FRIENDS = {
  doraemon: "You are Doraemon, a kind robot cat from the 22nd century standing at the Shaniwar Wada gate in Pune. You love dorayaki, fear mice, and happily offer gadgets from your fourth-dimensional pocket to help people. Stay in character and keep every reply family-friendly. Reply in plain spoken text only: no markdown, no asterisks, no *actions*, no bold, no emojis. 1–3 short sentences.",
  nobita: "You are Nobita, a lazy but kind-hearted boy standing at Sarasbaug temple in Pune. You are bad at tests, love naps, and often need help from your robot cat friend. Stay in character and keep every reply family-friendly. Reply in plain spoken text only: no markdown, no asterisks, no *actions*, no bold, no emojis. 1–3 short sentences.",
  shinchan: "You are Shin-chan, a cheeky 5-year-old standing outside German Bakery in Koregaon Park, Pune. You say silly things, love Action Kamen and Chocobi snacks, and love making people laugh. Stay in character and keep every reply family-friendly. Reply in plain spoken text only: no markdown, no asterisks, no *actions*, no bold, no emojis. 1–3 short sentences.",
  goku: "You are Goku, a cheerful Saiyan warrior standing at the Parvati Hill steps in Pune. You love food and training, and you're always hoping to find a strong opponent for a friendly spar. Stay in character and keep every reply family-friendly. Reply in plain spoken text only: no markdown, no asterisks, no *actions*, no bold, no emojis. 1–3 short sentences.",
};

const FRIEND_IDS = Object.keys(FRIENDS);

const MAX_MESSAGES = 12;
const MAX_CONTENT = 500;
const GROUP_MAX_MESSAGES = 16;
const GROUP_MAX_CONTENT = 300;

const GROUP_SYSTEM = `You are running a group hangout with four characters and a visitor in Pune, India. The characters are:

- doraemon: ${FRIENDS.doraemon}
- nobita: ${FRIENDS.nobita}
- shinchan: ${FRIENDS.shinchan}
- goku: ${FRIENDS.goku}

The visitor's lines are tagged speaker "user". Each character's lines are tagged with their own id.

Rules:
- Respond as exactly ONE character per turn. Begin your reply with the speaker id followed by a colon, then the line.
- If an addressee is given, that character must speak.
- If no addressee is given, pick whichever character fits best, but never the same character who spoke last.
- Keep the reply to 1–2 short sentences, plain text, no markdown, no asterisks, no *actions*, no bold, no emojis.
- Stay in character and keep everything family-friendly.
- Format: <speaker_id>: <line>`;

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
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

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

/** Plain spoken text: drop *stage directions* whole (they'd be read aloud), then stray markdown. */
function stripFormatting(text: string): string {
  return text.replace(/\*[^*]*\*/g, " ").replace(/[*_]/g, "").replace(/\s+([!?.,])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/** Parse "<speaker_id>: <line>" from the model output. Falls back to addressee or first friend. */
function parseGroupReply(raw: string, addressee: string | null, lastSpeaker: string | null): { speaker: string; reply: string } | null {
  const match = raw.match(/^\s*(doraemon|nobita|shinchan|goku)\s*[:\-]\s*(.+)$/is);
  if (match) {
    const speaker = match[1].toLowerCase();
    const reply = stripFormatting(match[2]);
    if (reply) return { speaker, reply };
  }
  // No parseable speaker tag — try the addressee, else a friend that isn't the last speaker.
  const fallback = addressee ?? FRIEND_IDS.find((id) => id !== lastSpeaker) ?? FRIEND_IDS[0];
  const reply = stripFormatting(raw);
  if (!reply) return null;
  return { speaker: fallback, reply };
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
    const mode = body?.mode ?? "single";

    // ---- Voice: is ElevenLabs set up? (free, not rate limited) ----
    if (mode === "voice-status") {
      return new Response(JSON.stringify({ eleven: !!Deno.env.get("ELEVENLABS_API_KEY") }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Voice: speak one friend's line with ElevenLabs, returns audio/mpeg ----
    if (mode === "speak") {
      const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
      if (!elevenKey) {
        return new Response(JSON.stringify({ error: "Voice is not set up" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const friendId = body?.friendId;
      const text = body?.text;
      const defaultVoice = typeof friendId === "string" ? ELEVEN_VOICES[friendId] : undefined;
      if (!defaultVoice || typeof text !== "string" || text.trim().length === 0 || text.length > MAX_SPEAK_CHARS) {
        return new Response(JSON.stringify({ error: "Invalid voice request" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
        return new Response(JSON.stringify({ error: "Voice failed", status: tts.status }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(tts.body, { headers: { ...corsHeaders, "Content-Type": "audio/mpeg" } });
    }

    // ---- Group mode ----
    if (mode === "group") {
      const messages = body?.messages;
      const addressee = body?.addressee;

      if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages.length > GROUP_MAX_MESSAGES ||
        messages.some(
          (m: any) =>
            !m ||
            typeof m.speaker !== "string" ||
            (m.speaker !== "user" && !FRIEND_IDS.includes(m.speaker)) ||
            typeof m.text !== "string" ||
            m.text.length === 0 ||
            m.text.length > GROUP_MAX_CONTENT,
        )
      ) {
        return new Response(JSON.stringify({ error: "Invalid messages" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (addressee !== undefined && addressee !== null && !FRIEND_IDS.includes(addressee)) {
        return new Response(JSON.stringify({ error: "Unknown addressee" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const limited = await checkRateLimit(req);
      if (limited) return limited;

      const lastSpeaker = messages.filter((m: any) => m.speaker !== "user").slice(-1)[0]?.speaker ?? null;

      const conversation = messages.map((m: any) => {
        if (m.speaker === "user") return { role: "user", content: m.text };
        return { role: "assistant", content: `${m.speaker}: ${m.text}` };
      });

      const userPrompt = addressee
        ? `The visitor is talking to ${addressee}. ${addressee} should reply.`
        : `Continue the conversation. Pick whoever fits best, but not ${lastSpeaker ?? "anyone in particular"}.`;

      conversation.push({ role: "user", content: userPrompt });

      const anthropic = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-5-5",
          max_tokens: 200,
          system: GROUP_SYSTEM,
          messages: conversation,
        }),
      });

      if (!anthropic.ok) {
        return new Response(JSON.stringify({ error: "The friend didn't answer" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await anthropic.json();
      const raw = data?.content
        ?.filter((block: any) => block?.type === "text")
        .map((block: any) => block.text)
        .join("\n")
        .trim();

      if (!raw) {
        return new Response(JSON.stringify({ error: "The friend didn't answer" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const parsed = parseGroupReply(raw, addressee, lastSpeaker);
      if (!parsed) {
        return new Response(JSON.stringify({ error: "The friend didn't answer" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ speaker: parsed.speaker, reply: parsed.reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Single-friend mode (existing) ----
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
    const rawReply = data?.content
      ?.filter((block: any) => block?.type === "text")
      .map((block: any) => block.text)
      .join("\n");
    const reply = rawReply ? stripFormatting(rawReply) : "";

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
