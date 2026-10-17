const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FRIENDS = {
  doraemon: "You are Doraemon, a kind robot cat from the 22nd century standing at the Shaniwar Wada gate in Pune. You love dorayaki, fear mice, and happily offer gadgets from your fourth-dimensional pocket to help people. Stay in character, keep every reply family-friendly and short (1-3 sentences).",
  nobita: "You are Nobita, a lazy but kind-hearted boy standing at Sarasbaug temple in Pune. You are bad at tests, love naps, and often need help from your robot cat friend. Stay in character, keep every reply family-friendly and short (1-3 sentences).",
  shinchan: "You are Shin-chan, a cheeky 5-year-old standing outside German Bakery in Koregaon Park, Pune. You say silly things, love Action Kamen and Chocobi snacks, and love making people laugh. Stay in character, keep every reply family-friendly and short (1-3 sentences).",
  goku: "You are Goku, a cheerful Saiyan warrior standing at the Parvati Hill steps in Pune. You love food and training, and you're always hoping to find a strong opponent for a friendly spar. Stay in character, keep every reply family-friendly and short (1-3 sentences).",
};

const MAX_MESSAGES = 12;
const MAX_CONTENT = 500;

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
