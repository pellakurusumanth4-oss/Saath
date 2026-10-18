// The AR talk function (supabase/functions/ar) runs web/talk's own server code. Bolt deploys only what is inside the
// function's folder, so these files are copies: run this after changing web/talk, or with --check to see they match.
// The only changes: the Anthropic SDK import (Deno takes it as an npm: specifier) and the key names (below).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const sdk = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies['@anthropic-ai/sdk'].replace(/^[\^~]/, '');
const files = {
  'reply.mjs': (s) => s,
  'prompts.mjs': (s) => s,
  'voices.json': (s) => s,
  // Supabase can't set env vars, so the laptop's key names also fall back to the names the Bolt secrets have.
  'server.mjs': (s) => s.replace("from '@anthropic-ai/sdk';", `from 'npm:@anthropic-ai/sdk@${sdk}';`)
    .replaceAll('process.env.CLAUDE_API_KEY', '(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY)')
    .replaceAll('process.env.ELEVEN_LABS_API_KEY', '(process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY)'),
};
const check = process.argv.includes('--check');
let stale = 0;
for (const [name, adapt] of Object.entries(files)) {
  const want = adapt(fs.readFileSync(path.join(root, 'web', 'talk', name), 'utf8'));
  const dest = path.join(root, 'supabase', 'functions', 'ar', name);
  if (name === 'server.mjs' && !want.includes(`npm:@anthropic-ai/sdk@${sdk}`)) throw new Error('server.mjs: SDK import not found');
  const have = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
  if (have === want) continue;
  stale++;
  if (check) console.error(`out of date: supabase/functions/ar/${name}`);
  else fs.writeFileSync(dest, want);
}
if (check && stale) process.exit(1);
console.log(check ? 'supabase/functions/ar copies match web/talk' : `copied ${stale} file(s) into supabase/functions/ar`);
