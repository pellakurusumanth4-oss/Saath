# The friends' voices

All voices are **original**: none is cloned, and the descriptions never name the characters or their voice actors. The friends only use a voice once its id is in `web/talk/voices.json`. Until then they speak with stand-in stock voices: Liam (Nobita), Laura (Shin-chan), Jessica (Doraemon) and Charlie (Goku).

ElevenLabs' **Free plan can't design voices through the API** (checked 18 Oct: *"Creating a voice through the API is only available on a paid plan"*), and it holds only 3 custom voices. That leaves two ways:

## (a) Design them yourself on elevenlabs.io (free)

For Nobita, then Shin-chan, then Doraemon:
1. Go to elevenlabs.io → **Voices** → **Voice Design**.
2. Paste the friend's **description** and **line** below.
3. Generate, listen to the 3 previews, and save the one you like. Name it e.g. "Saath Nobita".
4. Open the saved voice, copy its **Voice ID**, and send it to me. Voice IDs aren't secret.

Goku uses one of the ready-made voices (these don't use a slot). I'll send you short samples of a few to pick from.

## (b) Starter plan ($6/month, $1 the first month)

I run `node --env-file=.env.local scripts/voices.mjs design <friend>`, send you the 3 previews, and save your pick with `… keep <friend> <id>`.

## Descriptions and lines

| Friend | Description | Line |
|---|---|---|
| Nobita | Native English with a light Indian English accent. Boy, about 10 years old. Perfect audio quality. Gentle, soft, slightly high voice of a sweet but lazy schoolboy; relaxed sleepy drawl, unhurried pace; turns whiny and pleading, with stretched-out vowels, when upset. | Huh? Oh, hi! You woke me up from the best nap ever. Do you want to sit under this big shady tree with me? Shh, please do not ask me about my homework! |
| Shin-chan | Native English with a light Indian English accent. Little boy, about 5 years old. Perfect audio quality. Cheeky, mischievous kid with a raspy, husky voice, slightly low for his age; lazy teasing drawl, smug and playful, giggles; exaggerated sing-song cartoon intonation. | Hey hey! Look at my super cool hero pose! These cinnamon rolls smell so yummy, my tummy is dancing. Do you want to see my wiggle dance? Hehe! |
| Doraemon | Native English with a light Indian English accent. Male-sounding cartoon character, ageless, like a cheerful young adult. Perfect audio quality. A friendly robot cat: warm, round, slightly nasal, bright voice with a soft husky edge; kind big-brother energy, chuckles often; medium-fast, bouncy, sing-song delivery. Natural human voice, no robotic effects. | Hello, my friend! Let me check my pocket, I am sure I have just the gadget for this. Oh! Did you hear a squeak? Please tell me that was not a mouse! |
| Goku (if designed) | Native English with a light Indian English accent. Adult man, early 30s. Perfect audio quality. Upbeat, energetic martial artist: bright, slightly raspy, open and friendly voice, a little naive and boyish; fast excited delivery, loud enthusiastic bursts, easy laughter. | Hey! Did you come to train with me? Yosha! Let us walk up these steps together, nice and slow. Whew, all this training makes me so hungry! |

The descriptions come from the research in `notes/talking-characters.md` (section 3), following ElevenLabs' Voice Design guidance: the language and accent first, no effect words.

## The TV friends: stand-ins (18 Oct, night)

They use ready-made voices, chosen by their descriptions to fit each personality. None imitates the actors. They're in `web/talk/voices.json`, and each has a sample reply in `~/.cache/saath-recovery/talk/{michael,dwight,holt}.wav`.

| Friend | Stand-in | Why |
|---|---|---|
| Michael Scott | Chris: "Charming, Down-to-Earth", middle-aged American | A chatty, eager boss who wants to be liked |
| Dwight Schrute | Adam: "Dominant, Firm", a brash, confident tenor | An earnest sergeant giving a briefing |
| Captain Holt | Brian: "Deep, Resonant and Comforting", middle-aged American | A calm, formal, deadpan captain |

If the user wants them designed instead, describe the personality, never the actor:
- **Michael:** an eager, warm office boss in his 40s, with a bright tenor and quick, excitable delivery.
- **Dwight:** an intense, very serious man in his late 30s; a firm, clipped, matter-of-fact delivery.
- **Holt:** a calm, formal man in his 50s with a deep, even voice, and a slow, precise, deadpan delivery.

## Saath's own voices, in the app since 18 Oct

The user asked for voices "accurate to the original characters". Cloning the real voice actors isn't possible: it copies real people without their permission, and Indian courts have stopped AI voice clones (Arijit Singh, 2024; Asha Bhosle, 2025). ElevenLabs forbids it too. The user then asked for at least 50-55% likeness. So each voice matches the character's kind of voice as children know it, never one actor's voice. For example, Shin-chan is a woman voicing a low, gravelly little boy, as in the dubs.

How they were made:
1. **Designed:** the open-source Qwen3-TTS VoiceDesign (Apache-2.0), run on the laptop's RTX 4050, made two takes per friend from a description.
   - Descriptions and lines: `~/.cache/saath-recovery/voices/qwen/design_samples.py`. Takes: `…/qwen/<friend>-<n>.wav`.
   - Players to compare: `voice-samples.html`, and `voices-in-app.html` (designed vs in-app), in the shared notes folder.
   - Checked: ElevenLabs Scribe wrote down all 14 correctly, and the pitch readings fit the voice types (Holt 88-94 Hz).
2. **Not run live on the GPU:** Qwen3-TTS spoke only at about real time on the laptop (the 0.6B model too: RTF 1.05-1.5), too slow for live replies, and its package can't stream. It was then removed; its 12.7 GB is in the Trash.
3. **Loaded into ElevenLabs:** on the Starter plan, the user upgraded on 18 Oct; Instant Voice Cloning of synthetic voices.
   - Takes used: Doraemon 2, Nobita 1, Shin-chan 2, Goku 2, Michael 1, Dwight 2, Holt 1. The ids are in `web/talk/voices.json`.
   - Same speed as the stock voices: about 150 ms to first audio when warm, 300-600 ms cold. A brand-new voice's very first request took 2-3 s.

To swap a friend's voice: clone another take (or a new Voice Design preview, now allowed on Starter), put its id in `voices.json`, and restart `web/serve.mjs`.

**18 Oct, later:** the user also heard three ElevenLabs Voice Design alternatives for Doraemon, Goku, Michael, Dwight and Holt.
- Voice Design refuses child voices, so there were none for Nobita and Shin-chan.
- The user said "now voices are good" and kept the current voices in `web/talk/voices.json`.
- The previews are in `~/.cache/saath-recovery/voices/<friend>/<n>.mp3`, with their ids in `voices/previews.json`. They take no voice slot unless kept.
- `voice-demo.mp3`, in the shared notes folder, plays every option with spoken labels.

