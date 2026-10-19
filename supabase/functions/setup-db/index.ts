// One-time database setup (19 Oct 2026): Bolt applies migrations only through its agent, which has no tokens left, so
// this applies the shop migrations in supabase/migrations/ (copied into migrations.mjs), each once. No input, fixed SQL,
// a no-op once everything is in. Replace it with a stub once it has run.
import postgres from "npm:postgres@3.4.5";
import MIGRATIONS from "./migrations.mjs";
import { setup } from "./setup.mjs";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 }); // a browser preflight runs nothing
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) return Response.json({ error: "no SUPABASE_DB_URL" }, { status: 500 });
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    return Response.json(await setup(sql, MIGRATIONS));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    await sql.end();
  }
});
