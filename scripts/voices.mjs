// The friends' voices, made with ElevenLabs Voice Design: original voices only, never a clone, and the descriptions
// never name the characters or their voice actors (notes/talking-characters.md, section 3). The key comes from
// .env.local; previews and samples cost credits.
//   design <friend>             3 previews -> ~/.cache/saath-recovery/voices/<friend>/<n>.mp3, and their preview ids
//   keep <friend> <preview id>  saves that preview as a voice (a custom-voice slot) and writes its id to web/talk/voices.json
//   try <friend> <voice id>     the friend's line in any voice, as the app will say it (Flash v2.5) -> <friend>/try-<id>.mp3
// Usage: node --env-file=.env.local scripts/voices.mjs design nobita
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VOICES = path.join(path.dirname(new URL(import.meta.url).pathname), '../web/talk/voices.json');
const OUT = path.join(os.homedir(), '.cache/saath-recovery/voices');
const LOOK = {
  doraemon: 'Native English with a light Indian English accent. Male-sounding cartoon character, ageless, like a cheerful young adult. Perfect audio quality. A friendly robot cat: warm, round, slightly nasal, bright voice with a soft husky edge; kind big-brother energy, chuckles often; medium-fast, bouncy, sing-song delivery. Natural human voice, no robotic effects.',
  nobita: 'Native English with a light Indian English accent. Boy, about 10 years old. Perfect audio quality. Gentle, soft, slightly high voice of a sweet but lazy schoolboy; relaxed sleepy drawl, unhurried pace; turns whiny and pleading, with stretched-out vowels, when upset.',
  shinchan: 'Native English with a light Indian English accent. Little boy, about 5 years old. Perfect audio quality. Cheeky, mischievous kid with a raspy, husky voice, slightly low for his age; lazy teasing drawl, smug and playful, giggles; exaggerated sing-song cartoon intonation.',
  goku: 'Native English with a light Indian English accent. Adult man, early 30s. Perfect audio quality. Upbeat, energetic martial artist: bright, slightly raspy, open and friendly voice, a little naive and boyish; fast excited delivery, loud enthusiastic bursts, easy laughter.',
};
const LINE = {
  doraemon: 'Hello, my friend! Let me check my pocket, I am sure I have just the gadget for this. Oh! Did you hear a squeak? Please tell me that was not a mouse!',
  nobita: 'Huh? Oh, hi! You woke me up from the best nap ever. Do you want to sit under this big shady tree with me? Shh, please do not ask me about my homework!',
  shinchan: 'Hey hey! Look at my super cool hero pose! These cinnamon rolls smell so yummy, my tummy is dancing. Do you want to see my wiggle dance? Hehe!',
  goku: 'Hey! Did you come to train with me? Yosha! Let us walk up these steps together, nice and slow. Whew, all this training makes me so hungry!',
};
const [cmd, friend, id] = process.argv.slice(2);
if (!LOOK[friend] || !['design', 'keep', 'try'].includes(cmd) || (cmd !== 'design' && !id)) throw new Error('usage: design|keep|try <friend> [id]');
const key = process.env.ELEVEN_LABS_API_KEY;
if (!key) throw new Error('ELEVEN_LABS_API_KEY is not set (run with --env-file=.env.local)');
const api = async (p, body) => {
  const res = await fetch('https://api.elevenlabs.io' + p, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${p}: ${res.status} ${await res.text()}`);
  return res;
};
const dir = path.join(OUT, friend);
fs.mkdirSync(dir, { recursive: true });

if (cmd === 'design') {
  const { previews } = await (await api('/v1/text-to-voice/design', { voice_description: LOOK[friend], model_id: 'eleven_ttv_v3', text: LINE[friend] })).json();
  previews.forEach((p, i) => {
    const file = path.join(dir, `${i + 1}.mp3`);
    fs.writeFileSync(file, Buffer.from(p.audio_base_64, 'base64'));
    console.log(file, p.generated_voice_id, p.duration_secs ? p.duration_secs.toFixed(1) + ' s' : '');
  });
} else if (cmd === 'keep') {
  const { voice_id } = await (await api('/v1/text-to-voice', { voice_name: `Saath ${friend}`, voice_description: LOOK[friend], generated_voice_id: id })).json();
  const voices = JSON.parse(fs.readFileSync(VOICES, 'utf8'));
  fs.writeFileSync(VOICES, JSON.stringify({ ...voices, [friend]: voice_id }, null, 2) + '\n');
  console.log(friend, '->', voice_id, 'in', VOICES);
} else {
  const res = await api(`/v1/text-to-speech/${id}?output_format=mp3_44100_128`, { text: LINE[friend], model_id: 'eleven_flash_v2_5',
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: false, speed: 1 } });
  const file = path.join(dir, `try-${id}.mp3`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(file);
}
