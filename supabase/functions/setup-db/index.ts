// One-time database setup (19 Oct 2026): Bolt applies migrations only through its agent, which has no tokens left, so
// this applies supabase/migrations/20261019013000_shops_menus_reviews.sql (copied into migration.mjs). No input, fixed
// SQL, and a no-op once the shops table exists. Replace it with a stub once it has run.
import postgres from "npm:postgres@3.4.5";
import MIGRATION from "./migration.mjs";
import { setup } from "./setup.mjs";

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) return Response.json({ error: "no SUPABASE_DB_URL" }, { status: 500 });
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    return Response.json(await setup(sql, MIGRATION));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    await sql.end();
  }
});
