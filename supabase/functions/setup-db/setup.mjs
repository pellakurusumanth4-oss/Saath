// Applies the shops migration once: nothing to do when the shops table is already there. sql: a postgres.js client.
export async function setup(sql, migration) {
  const [{ ready }] = await sql`select to_regclass('public.shops') is not null as ready`;
  // No parameters, so postgres.js sends it as one simple query: every statement in one transaction, all or nothing.
  if (!ready) await sql.unsafe(migration);
  const [counts] = await sql`select (select count(*) from public.shops)::int as shops,
    (select count(*) from public.menu_items)::int as items,
    (select array_agg(tablename::text order by tablename) from pg_publication_tables where pubname = 'supabase_realtime') as realtime`;
  return { applied: !ready, ...counts };
}
