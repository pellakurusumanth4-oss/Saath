// Copies the approved AR rig pages into the site so /rigs/<character>.html works.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', '..', 'web', 'ar', 'rigs');
const to = join(here, '..', 'public', 'rigs');

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log('copied rigs to site/public/rigs');
