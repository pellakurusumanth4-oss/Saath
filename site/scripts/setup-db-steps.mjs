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
].map(([name, done]) => ({ name, done, sql: fs.readFileSync(path.join(root, 'supabase', 'migrations', `${name}.sql`), 'utf8') }));
fs.writeFileSync(path.join(root, 'supabase', 'functions', 'setup-db', 'migrations.mjs'),
  `// Generated from supabase/migrations/ by site/scripts/setup-db-steps.mjs; do not edit by hand.\nexport default ${JSON.stringify(steps, null, 1)};\n`);
console.log(`setup-db steps: ${steps.map((s) => s.name).join(', ')}`);
