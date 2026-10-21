// Writes supabase/functions/setup-db/migrations.mjs: the migrations setup-db applies, in order, each skipped once its
// `done` query says it is in. Run after adding a migration: node site/scripts/setup-db-steps.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const steps = [
  ['20261019013000_shops_menus_reviews', "to_regclass('public.shops') is not null"],
  ['20261019021500_mascot_hosts', "exists (select 1 from public.shops where slug = 'wada-gate-juice-bar')"],
  ['20261019024000_demo_shops', "exists (select 1 from public.shops where slug = 'copper-ladle')"],
  ['20261019050000_city_day', "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shops' and column_name = 'board_lng')"],
  ['20261019120000_visits_reviews', "to_regprocedure('public.owner_visits(uuid,integer)') is not null"],
  ['20261019140000_reviews_count_once', "to_regclass('public.content_reports') is not null"],
  ['20261019150000_owner_onboarding', "to_regprocedure('public.shops_publish_check()') is not null"],
  ['20261019160000_prices_in_dollars', "col_description('public.menu_items'::regclass, (select attnum from pg_attribute where attrelid = 'public.menu_items'::regclass and attname = 'price')::int) = 'US dollars'"],
  ['20261019170000_owners_just_register', "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shops' and column_name = 'hours')"],
  ['20261019170500_demo_owner', "exists (select 1 from auth.users where id = '5aa7de00-0000-4000-8000-0000000000d1')"],
  ['20261019180000_code_tries_today', "position('ELSE 2000' in pg_get_functiondef('public.verify_visit(text,text)'::regprocedure)) > 0"],
  ['20261019190000_demo_owner_guard', "exists (select 1 from pg_trigger where tgname = 'keep_demo_owner_login')"],
  ['20261019200000_remove_momos_test_shop', "not exists (select 1 from public.shops where id = '978f92c7-6d37-41bb-9a18-706c9c886e38')"],
  ['20261019210000_unpublish_test_shops', "not exists (select 1 from public.shops where id in ('559a36f9-46f2-4d1d-bded-3a5ebe5d79dc', '4dea2ead-eb04-4599-a900-a14efdf7d53f') and published)"],
  ['20261020220000_footfall_name', "not exists (select 1 from public.shops where demo and array_to_string(offers, ' ') like '%Saath%')"],
  ['20261021113000_visit_counter', "exists (select 1 from pg_proc where proname = 'daily_stats')"],
  ['20261021114000_visit_counter_fix', "position('v_page' in pg_get_functiondef('public.hit(text,text)'::regprocedure)) > 0"],
].map(([name, done]) => ({ name, done, sql: fs.readFileSync(path.join(root, 'supabase', 'migrations', `${name}.sql`), 'utf8') }));
fs.writeFileSync(path.join(root, 'supabase', 'functions', 'setup-db', 'migrations.mjs'),
  `// Generated from supabase/migrations/ by site/scripts/setup-db-steps.mjs; do not edit by hand.\nexport default ${JSON.stringify(steps, null, 1)};\n`);
console.log(`setup-db steps: ${steps.map((s) => s.name).join(', ')}`);
