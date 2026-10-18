// Saath's AR talk API for the AR page hosted on the website (/ar/): the laptop's web/serve.mjs /api/talk and
// /api/hear on Supabase, running web/talk's own talk(), hear(), warm() and checkInput() (copied here by
// site/scripts/sync-ar-function.mjs). Same rules as serve.mjs: JSON-only talk, size caps, per-IP limits; instead of
// the localhost Host check, only the website's origin may call it (CORS) and the Supabase gateway wants its key.
// Keys are Supabase secrets (ANTHROPIC_API_KEY, ELEVENLABS_API_KEY), never in code; nothing anyone says is logged.
import process from "node:process";
import { createHash } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ACTIONS, checkInput } from "./reply.mjs";
import { hear, talk, warm } from "./server.mjs";

// server.mjs reads its keys from process.env (only reading: Supabase can't set env vars at run time).
(globalThis as { process?: unknown }).process ??= process;

const ORIGINS = new Set(["https://pellakurusumanth4-os-39c4.bolt.host"]);
// Shared with the website's talk function (same table): a question is two or three calls (warm, hear, talk).
const PER_MINUTE = 30, PER_DAY = 1000;

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    Vary: "Origin",
  };
}

const json = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json", "cache-control": "no-store" } });

// Per-IP limits, as the website's talk function does them (an IP hash, counted over a minute and a day).
async function overLimit(req: Request): Promise<boolean> {
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const ip = createHash("sha256").update((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown").digest("hex");
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [minute, day] = await Promise.all([
    db.from("talk_requests").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", since(60_000)),
    db.from("talk_requests").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", since(86_400_000)),
  ]);
  if (minute.error || day.error) return false; // fail open rather than block the friends
  if ((minute.count ?? 0) >= PER_MINUTE || (day.count ?? 0) >= PER_DAY) return true;
  await db.from("talk_requests").insert({ ip });
  return false;
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const path = new URL(req.url).pathname;
  const route = path.endsWith("/api/talk") ? "talk" : path.endsWith("/api/hear") ? "hear" : null;
  if (req.method !== "POST" || !route) return json(404, { error: "not found" }, cors);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

  // A recording to write down, for browsers that can't hear: audio only, up to 2 MB.
  if (route === "hear") {
    if (!/^audio\/(webm|ogg|mp4|mpeg|wav)$/.test(type)) return json(400, { error: "send audio" }, cors);
    const audio = new Uint8Array(await req.arrayBuffer());
    if (audio.length > 2_000_000) return new Response(null, { status: 413, headers: cors });
    if (await overLimit(req)) return json(429, { error: "Too many messages, try again in a minute" }, cors);
    const out = await hear(audio, type, req.signal);
    return json(out.error ? 502 : 200, out, cors);
  }

  // A friend's reply as NDJSON lines; {friend, warm: true} only warms the connections up.
  if (type !== "application/json") return json(415, { error: "send JSON" }, cors);
  const raw = await req.text();
  if (raw.length > 20_000) return new Response(null, { status: 413, headers: cors });
  let input;
  try {
    const data = JSON.parse(raw);
    if (data?.warm === true) {
      if (!Object.hasOwn(ACTIONS, data.friend ?? "")) throw new Error("unknown friend");
      if (await overLimit(req)) return json(429, { error: "Too many messages, try again in a minute" }, cors);
      const warming = warm(data.friend);
      (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(warming);
      return new Response(null, { status: 204, headers: cors });
    }
    input = checkInput(data);
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message : "bad request" }, cors);
  }
  if (await overLimit(req)) return json(429, { error: "Too many messages, try again in a minute" }, cors);

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      let open = true;
      await talk(input, (o: unknown) => {
        if (!open) return;
        try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { open = false; }
      }, req.signal);
      if (open) controller.close();
    },
  });
  return new Response(body, { headers: { ...cors, "content-type": "application/x-ndjson", "cache-control": "no-store" } });
});
