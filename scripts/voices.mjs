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
// Each character's kind of voice and way of speaking as children know them (the user, 18 Oct: "at least 50-55%"),
// never an actor's voice: rhythm, energy, laughs and tics, so it feels like the character without copying anyone.
const LOOK = {
  doraemon: 'Native English with a light Indian English accent. A woman performing a cartoon robot cat, as in a cartoon dub. Perfect audio quality. A husky, slightly hoarse, warm and round voice, mid-low for a woman and a little nasal. Speaks in a bouncy sing-song, rising to an excited "Ooh!" and a thoughtful "Hmm!", with a quick throaty chuckle; kind big-brother warmth, a little fussy and dramatic when flustered.',
  nobita: 'Native English with a light Indian English accent. A woman performing a 10-year-old boy, as in a cartoon dub. Perfect audio quality. A soft, slightly nasal, boyish voice, a bit high. Sleepy and sheepish, with a relaxed drawl, little "umm"s and shy "ehehe" laughs; turns whiny and pleading, stretching his vowels, when upset, then cheers up quickly.',
  shinchan: 'Native English with a light Indian English accent. A woman performing a cheeky 5-year-old boy, as in a cartoon dub. Perfect audio quality. A low, gravelly, croaky voice, surprisingly deep for a small child. A lazy, teasing, sing-song drawl that stretches his vowels, smug and playful, with sudden squeaky highs and naughty giggles.',
  goku: 'Native English with a light Indian English accent. A young man in his twenties performing a cartoon martial-arts hero. Perfect audio quality. A bright, slightly raspy, open and friendly voice, boyish and a little naive. Fast, excited delivery with loud enthusiastic bursts, a cheerful "Hey!" and easy laughter.',
  michael: 'Native American English. A man in his mid 40s. Perfect audio quality. A mid-range, slightly nasal, very expressive voice. Eager and chatty like a game-show host, with big dramatic emphasis and awkward little pauses; his voice rises and cracks when he gets excited or embarrassed.',
  dwight: 'Native American English. A man in his late 30s. Perfect audio quality. A firm, flat, slightly nasal mid-range voice. Very serious, intense and proud; a clipped, matter-of-fact delivery like a sergeant briefing a recruit, with sudden sharp emphasis on key words.',
  holt: 'Native American English. A man in his late 50s. Perfect audio quality. A deep, resonant, even voice. Very slow, precise, formal delivery, every word fully pronounced, with almost no change in pitch or feeling: perfectly deadpan.',
};
const LINE = {   // 100-1000 characters, as Voice Design needs
  doraemon: 'Hello, my friend! Let me check my pocket, I am sure I have just the gadget for this. Oh! Did you hear a squeak? Please tell me that was not a mouse!',
  nobita: 'Huh? Oh, hi! You woke me up from the best nap ever. Do you want to sit under this big shady tree with me? Shh, please do not ask me about my homework!',
  shinchan: 'Hey hey! Look at my super cool hero pose! These cinnamon rolls smell so yummy, my tummy is dancing. Do you want to see my wiggle dance? Hehe!',
  goku: 'Hey! Did you come to train with me? Yosha! Let us walk up these steps together, nice and slow. Whew, all this training makes me so hungry!',
  michael: "Okay! Welcome, welcome! I am so happy you're here. This is going to be the best day ever, and I have a little trophy with your name on it!",
  dwight: 'Question. Are you prepared? Fact: I am always prepared. I have a spare beet in my pocket, and a safety plan for this sandwich.',
  holt: 'Hello. I am experiencing joy. That is very rare, so please enjoy it. Now, would you like to hear a riddle? I have prepared seven.',
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
