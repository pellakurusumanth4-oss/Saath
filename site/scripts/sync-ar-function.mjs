// The Supabase functions run code that lives elsewhere in the repo: the AR talk function (supabase/functions/ar) runs
// web/talk's own server code, and both it and the website's talk function use web/talk's prompts and reply checks and
// the talk function's shop loader. Bolt deploys only what is inside a function's folder, so these files are copies: run
// this after changing any of them, or with --check to see they match.
// The only changes: the Anthropic SDK import (Deno takes it as an npm: specifier) and the key names (below).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const sdk = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies['@anthropic-ai/sdk'].replace(/^[\^~]/, '');
const same = (s) => s;
// Source (from the repo root), the functions that get a copy, and how the copy differs.
const files = [
  ['web/talk/reply.mjs', ['ar', 'talk'], same],
  ['web/talk/prompts.mjs', ['ar', 'talk'], same],
  ['web/talk/voices.json', ['ar'], same],
  // Supabase can't set env vars, so the laptop's key names also fall back to the names the Bolt secrets have.
  ['web/talk/server.mjs', ['ar'], (s) => s.replace("from '@anthropic-ai/sdk';", `from 'npm:@anthropic-ai/sdk@${sdk}';`)
    .replaceAll('process.env.CLAUDE_API_KEY', '(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY)')
    .replaceAll('process.env.ELEVEN_LABS_API_KEY', '(process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY)')],
  ['supabase/functions/talk/shop.mjs', ['ar'], same],
];
const check = process.argv.includes('--check');
let stale = 0;
for (const [source, functions, adapt] of files) {
  const want = adapt(fs.readFileSync(path.join(root, source), 'utf8'));
  if (source.endsWith('server.mjs') && !want.includes(`npm:@anthropic-ai/sdk@${sdk}`)) throw new Error('server.mjs: SDK import not found');
  for (const fn of functions) {
    const dest = path.join('supabase', 'functions', fn, path.basename(source));
    const have = fs.existsSync(path.join(root, dest)) ? fs.readFileSync(path.join(root, dest), 'utf8') : null;
    if (have === want) continue;
    stale++;
    if (check) console.error(`out of date: ${dest}`);
    else fs.writeFileSync(path.join(root, dest), want);
  }
}
if (check && stale) process.exit(1);
console.log(check ? 'the functions\' copies match their sources' : `copied ${stale} file(s) into supabase/functions`);
