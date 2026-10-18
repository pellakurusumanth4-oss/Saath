// Applies each migration once, in order: a step whose `done` query already says true is skipped. sql: a postgres.js
// client; steps: migrations.mjs (fixed SQL, never input).
export async function setup(sql, steps) {
  const applied = [];
  for (const step of steps) {
    const [{ done }] = await sql.unsafe(`select (${step.done}) as done`);
    if (done) continue;
    // No parameters, so postgres.js sends it as one simple query: every statement in one transaction, all or nothing.
    await sql.unsafe(step.sql);
    applied.push(step.name);
  }
  const [counts] = await sql`select (select count(*) from public.shops)::int as shops,
    (select count(*) from public.menu_items)::int as items,
    (select array_agg(friend order by slug) from public.shops) as hosts,
    (select array_agg(tablename::text order by tablename) from pg_publication_tables where pubname = 'supabase_realtime') as realtime`;
  return { applied, ...counts };
}
