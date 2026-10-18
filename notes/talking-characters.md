# Talking friends: research

Notes from 17 Oct 2026 for Saath's core feature. You ask a friend something, and they answer in their own voice with lip-sync, a face and an action.

Four research helpers looked at four areas: ElevenLabs, the Claude conversation, lip-sync for 2D rigs, and our own rigs. Their full reports are in the shared notes folder (`~/.config/Claude/side-session-notes/local_879a28ca-…/talking-research/`). So are the draft prompts, the face sheets of every existing mouth and eye, and two tested sketches.

"Checked" means read first-hand in this session; everything else comes from the helpers. **Nothing has been measured on the S24 yet.**

## In one minute

- **We build our own pipeline:**
  1. Chrome hears you.
  2. The laptop server asks Claude (Haiku 5.5, streamed).
  3. ElevenLabs Flash v2.5 speaks one sentence at a time and returns the time of every character.
  4. The AR page plays the sound and moves the mouth to those times.

  The alternative, ElevenLabs Agents, was rejected for three reasons. It bills its own copy of Claude, so your key goes unused. It needs a public tunnel to the laptop. And it doesn't send mouth timings in its default (WebRTC) mode.
- **Anime mouths are simple.** TV anime uses three mouth drawings (closed, half, open), changing about 8 times a second and closing on m, b and p. Matching every sound looks "creepy", in the words of an anime animator. Our rigs already draw 12 times a second.
- **Talking needs no new drawings.**
  - All four rigs already have closed, half-open and open mouths.
  - One line in `scripts/rig-ar.js` can lay a face over any clip, so a friend can wave or nap while the face talks.
  - The approved design files stay untouched.
- **Some feelings would need new drawings.**
  - Nobita has every face already.
  - Doraemon has no eyebrows, so sad, worried and angry would be new.
  - Goku has no sad brows.
  - Shin-chan has no tears, sweat drop or Zzz.
- **About 1.5 s is reachable but tight.** The estimate is 1.0–2.5 s from letting go of the button to the first sound, as the latency table in section 8 shows. Hold-to-talk saves the wait for silence, and a "thinking" face hides the rest.
- **It's cheap.** A reply costs about $0.0001 of Claude and $0.005 of ElevenLabs. A 5-minute demo costs about $0.20.
  - ElevenLabs' Free plan holds only 3 custom voices, and we need 4. Starter holds 10 ($6/month, $1 the first month).
- **A bug turned up on the way:** Goku has no outlines in the AR page today (section 6).

## 1. The pipeline: ours, not ElevenLabs Agents

| | ElevenLabs Agents | Our own pipeline |
|---|---|---|
| Claude | billed through ElevenLabs (Haiku 4.5, Sonnet 4.5–5.5, Opus 4.6–5.5); a "custom LLM" means ElevenLabs' cloud calls our server, so the laptop needs a public tunnel | our key, our server |
| Mouth timings | per character, but "not sent over WebRTC", the default for voice. Over WebSocket the SDK plays the sound, so matching is approximate | exact, on our own audio clock |
| Face and action | "client tools"; when they fire relative to speech is undocumented | a tag at the start of each reply |
| Code | 1.1 MB SDK, plus 4 agents set up in their dashboard | about 300 lines, plus the Anthropic SDK on the server |
| 5-minute demo | ~$0.40 plus Claude | ~$0.19 plus Claude |
| Risk | its voice link (WebRTC, via LiveKit) inside an AR session is untested; tunnel | more of our own code |

## 2. Claude: what the friend says

- **Model and settings.**
  - `claude-haiku-5-5` with `thinking: {type: "disabled"}`, `output_config: {effort: "low"}`, `max_tokens` 200 and streaming. Haiku 5.5 thinks by default at `medium` effort, which adds about 2 s.
  - Don't send `temperature`: any non-default value returns a 400 error on Haiku 5.5. (checked)
  - Price: $0.10 per million tokens in and $0.50 out, so about $0.0001 per reply. (checked)
  - Sonnet 5.5 ($2/$10) holds a persona better. Keep it as a switch; to turn its thinking off, send `{type: "between_tools"}`, because `disabled` is a 400 there. (checked)
- **Library.** The official SDK, `@anthropic-ai/sdk`, with `client.messages.stream(...)`. The `claude-api` skill requires the SDK over raw HTTP. (checked)
- **Reply format: `[emotion|action] words`.**
  - The tag is about 6 tokens, so the face and action can start before the voice.
  - Tool calls or JSON output would need a JSON decoder running as the reply streams in, and gain nothing for 1–3 sentences.
  - **Emotions (8):** neutral, happy, excited, surprised, curious, sad, worried, sleepy. An unknown emotion counts as neutral.
  - **Actions**, each mapped to a clip the rig already has. An unknown action, or another friend's, counts as idle. Nap, teleport, fly and late play after the friend stops talking.

    | Friend | action → clip |
    |---|---|
    | Doraemon | wave → Hi!, gadget → Gadget!, fly → Take-copter, cheer → Yay! |
    | Nobita | wave → Hi!, late → Late!, call → Doraemon~!, nap → Nap, aim → Bang!, cheer → Yatta! |
    | Shin-chan | wave → Hi!, dance → Buri-buri, pose → Action Kamen, cheer → Yay! |
    | Goku | wave → Hi!, blast → Kamehameha!, teleport → Instant Transmission, cheer → Yosha! |

- **Sentences.**
  - A sentence ends at `. ! ? …`, but not after Mr., Dr., initials or a number like 3.5.
  - A run-on sentence over 160 characters is cut at a comma.
  - At most 3 sentences per reply.
  - The helper's splitter passes its own tests (`research-b/saath-claude-sketch.mjs`).
- **The prompt.**
  - It has two parts: shared rules (765 words) and a friend block (310–384 words). The friend block covers who they are, how they talk, 4 facts about their place, what they're doing right now, and their actions.
  - Replies are 1–3 short sentences under 40 words. The first sentence is very short, numbers are written as words, and there are no emojis or markdown.
  - Drafts are in `research-b/prompts/`.
- **Place facts**, checked by the helper against Wikipedia, pune.gov.in and The Hindu:
  - **Shaniwar Wada's Delhi Gate:** finished in 1732. "Shaniwar" means Saturday, the day the foundation was laid in 1730. Each door half has 72 spikes at an elephant's forehead height.
  - **Sarasbaug:** "Talyatla Ganpati" means the Ganpati of the lake, because the temple was built in a lake. Work began in 1750 and the idol was installed in 1784. The lake became a 25-acre garden in the 1960s.
  - **German Bakery:** opened in the late 1980s by Dnyaneshwar Kharose and his German friend Klaus Gutzeit. Known for cinnamon rolls and apple pie.
  - **Parvati Hill:** 640 m above sea level. The Devdeveshwar temple was finished in 1749.
  - **Disputed:** Parvati has 103 steps or 108, depending on the source, so Goku says "more than a hundred, count them yourself!" The bakery opened in 1988 or 1989.
- **Caching.**
  - The minimum cacheable prompt is 512 tokens on Haiku 5.5. Ours is about 2,000, so it caches. Mark the friend block with `cache_control: {type: "ephemeral", ttl: "1h"}`. (checked)
  - A request with `max_tokens: 0`, sent without streaming, pre-warms the cache. (checked)
  - The real win is the network connection: Node's `fetch` drops idle connections after about 4 s. So pre-warm the moment the mic opens; the handshake then happens while the child is still talking.
- **Memory.** The page keeps the last 8 messages with the current friend and sends them each turn. The server checks them: at most 8, alternating speakers, each at most 400 characters.

## 3. ElevenLabs: the friend's voice

- **The endpoint.** `POST /v1/text-to-speech/{voice_id}/stream/with-timestamps` streams one JSON object per line: `audio_base64` plus the character timings (`characters`, `character_start_times_seconds`, `character_end_times_seconds`). Use the `normalized_alignment` version of the timings for the mouth, because it times what is actually spoken: "3" becomes "three".
- **Settings.**
  - `model_id: eleven_flash_v2_5`. The default is the slower Multilingual v2.
  - `output_format: pcm_24000`: raw 16-bit audio, the easiest to play without gaps in Web Audio.
  - `previous_text`, so the voice stays even across sentences.
  - `voice_settings`: stability 0.5, similarity 0.75, style 0, `use_speaker_boost: false` (style and speaker boost both add delay), speed 1.0.
- **Answered by a real call (18 Oct, `web/talk/smoke.mjs`):** the first chunk of each sentence carries the timings for the whole sentence, counted from that sentence's start. The later chunks carry audio only, with no timings. So the page anchors each sentence's mouth timeline where that sentence's first audio is scheduled.
- **Measured from the laptop (18 Oct), from the request to the first audio:**
  - 1.5 s on a new connection with the prompt cached (Claude's first byte at 975 ms, the tag at 1216 ms, ElevenLabs' first byte about 270 ms after the first sentence);
  - 1.17 s warm;
  - 2.98 s the very first time (cache write plus new connections).

  The cache read 2,168 tokens per reply. Later sentences arrive long before they're needed. Still to add on the phone: speech recognition finishing and playback start.
- **Warming up on the mic press (18 Oct, over HTTP):** the time to the first audio went from 1414 ms cold to 1171 ms when warmed up 1.5 s earlier, about 0.25 s saved.
- **Voice Design through the API is paid-only:** a 403, *"Creating a voice through the API is only available on a paid plan"*. On the Free plan, voices are designed on elevenlabs.io (see `notes/talking-voices.md`).
- **WebSocket input** lets Claude's words go in while it is still writing. For 1–3 short sentences, one HTTP request per sentence is simpler; the gain is guessed at 0–200 ms.
- **Voices: original only.**
  - Voice Design (`POST /v1/text-to-voice/design`, model `eleven_ttv_v3`) gives 3 previews per try and charges only for the preview text. `POST /v1/text-to-voice` then saves the chosen one.
  - "child" is a documented age setting. Child-like voices can't be shared to the public library, and the use policy bans imitating real people or real children. So all four voices stay private, and the prompts never name the characters or their voice actors.
  - Draft prompts are in `research-a/report.md`.
  - Unverified: whether a voice made with `ttv_v3` plays on Flash v2.5.
- **Later:** Eleven v4 Turbo (out 28 Sep 2026, ~100 ms, Flash's price) acts on emotion tags such as `[laughs]`. The docs list it for WebSocket only. Flash would read such tags aloud, so the server strips them.
- **Speed.** Flash takes about 75 ms to make audio, and the first byte reaches South Asia in 150–200 ms. Servers are in the USA, the Netherlands and Singapore.
- **Cost.** Flash costs $0.04 per 1,000 characters (0.5 credit each).
  - The Free plan has only 3 custom voices (we need 4), allows 2 requests at once, and is non-commercial with attribution.
  - Starter is $6/month ($1 the first month) with 10 voices.

## 4. Hearing the child

- **Chrome's Web Speech API works on Android.**
  - It takes `lang = 'en-IN'`, gives interim results, and shows no dialog.
  - It needs the network: it uses Google's servers, and Android has no on-device mode.
  - It must start from a tap.
  - `continuous` has no effect on Android, so it stops on its own after a silence. `stop()` returns what it heard so far.
- **Hold to talk:** press to listen, let go to send. This skips the wait for silence. It also keeps the mic off while the friend talks, which matters because Web Speech has no echo cancellation.
- **Fallbacks:**
  - ElevenLabs Scribe v2 Realtime: a WebSocket with partial results in about 150 ms, $0.39 an hour, and a single-use token for the browser.
  - A text box.
- **Unknown:** do the mic prompt and Web Speech work inside the AR session? Test this on the phone on day one. If they don't, ask for the mic before starting AR.

## 5. The mouth: anime lip flap

- **TV anime uses 3 mouths: closed, mid and open.**
  - They are drawn on 3s: each drawing is held for 125 ms, about 8 changes a second.
  - The closed mouth keeps coming back ("evenly random"). Open, mid, open, mid looks like jitter.
  - A line ends open, then mid, then closed.
  - Vowel shapes are optional, and the mouth closes on p and m "in principle".
  - English dubs of these shows play over exactly these flaps.
- **Our rule**, from the helper's sketch, tested only on made-up timings (`research-c/lipflap-sketch.mjs`):
  - For each 1/12 s drawing, look at the sounds 50 ms ahead.
  - m, b or p covering a quarter of the drawing → closed.
  - A vowel covering 40% of it → open (for a, o or a long vowel), otherwise mid.
  - A pause over 350 ms → closed.
  - A closed mouth at least every 5 drawings.

  This gives 6–7 changes a second.
- **Optional:** a loudness curve from the decoded audio picks open versus mid more reliably. Add it only if the letters alone look wrong.
  - **Done 18 Oct, after the phone test** ("the lip sync need to be accurate"). On a real reply, the letters matched the voice's loudness in only 50-71% of drawings, and their timeline ran on a grid out of step with the rig's drawings.
  - Now `web/talk/mouth.mjs` `mouthAt()` works out each drawing from the next 83 ms of the voice itself, 50 ms ahead:
    - quiet (under 0.2 of the sentence's loud) → closed;
    - a dip, under 0.55 and 20% quieter than both neighbours → closed;
    - m, b or p from the timings → closed;
    - loud (0.6 or more) → open;
    - anything else → half.

    The page asks for it every frame, so it is always in step with the rig's next drawing. This gives about 5-7 changes a second.
- **Sync.**
  - People notice sound that is 45 ms early or 125 ms late (ITU-R BT.1359-1). So the mouth may lead the sound, but should never trail it by more than about 40 ms. Animators never put a drawing after its sound.
  - Time the mouth from the audio clock: `AudioContext.getOutputTimestamp()`, or else `currentTime − outputLatency`.
  - Bluetooth adds 250–480 ms on Android. If Chrome doesn't report it, the mouth runs early; a `?lip=` offset in the page URL would let us tune it.
- **Prior art.**
  - TalkingHead (MIT) uses ElevenLabs timings at word level, with letter rules that are about 80% right. Borrow its blink and eye-contact numbers.
  - Rhubarb (MIT) works offline on finished audio. Borrow its 70 ms minimum per mouth shape and its pause rules.
  - wawa-lipsync guesses 15 mouth shapes from the sound, which is just noise for a 3-mouth face.
  - Live2D drives mouth-open from loudness alone.

## 6. Faces and actions: what the rigs already have

- **The hook.**
  - All four rigs draw through a top-level `apply(svg, pose)`. Changing `rig-ar.js:262` to `apply(svg, Object.assign(CLIPS[cur][2](s), face))` lays the talking face over whatever clip is playing.
  - The helper tested it in memory, without editing any file, on all four rigs. The mouth showed in every clip except two, where the face can't be seen: Shin-chan's back view (Buri-buri) and Goku's Instant Transmission.
- **Mouth names per rig** (all existing drawings):

  | | closed | half | open | round |
  |---|---|---|---|---|
  | Doraemon | smile | a | open | o |
  | Nobita | smile | talk | open | o |
  | Shin-chan | closed | a | laugh | o |
  | Goku | closed | o | a | o |

- **Feelings:**

  | | Exists | Can be made from existing parts | New drawing (needs your approval) |
  |---|---|---|---|
  | Doraemon | happy | sleepy, surprised (weak) | sad, worried, angry (he has no brows) |
  | Nobita | happy, surprised, sad (tears), worried (sweat), sleepy | angry (his official angry brows) | none |
  | Shin-chan | happy (with blush) | surprised, angry, sleepy, sad/worried (brow angles no clip uses yet) | tears, sweat, Zzz |
  | Goku | happy, angry | surprised, sleepy | sad/worried brows |

  None of these combinations has been reviewed by you yet. Sheets of every existing mouth, eye and brow are in `research-d/*-faces.png`.
- **Traps.**
  - In Doraemon, Shin-chan and Goku, a wrong mouth or eye name hides every mouth or eye, so the name tables must be exact.
  - Nobita's Bang! clip hides his eyes behind his glasses' glint.
  - Nobita's worried brows barely show under his hair.
  - Setting the eyes for a feeling stops the blink.
- **Existing talking.** The Hi! clips already "talk" with a fixed mouth pattern that isn't tied to any sound.
- **Cost.**
  - The AR page already re-draws the rig into WebGL 12 times a second, because the rig breathes. A mouth riding that beat adds no extra re-draws.
  - On the desktop with software graphics (only a stand-in for the phone), a re-draw takes 6.5–9.2 ms against an 83 ms budget.
- **Bug: Goku has no outlines in the AR page today.**
  - His line styles live in his page's `<head>` (`goku.html:23-27`) and use a CSS variable set on the live drawing.
  - The AR page copies only the `<svg>` and drops its style (`web/ar/index.html:95-96`). His outlines vanish and line-only paths fill black.
  - I checked this on the helper's render (`research-d/ar-textures-strip.png`). Fix: copy the styles into the copy.

## 7. Where it runs

- **First, the AR page** (`web/ar/index.html`). It already loads the rig in a same-origin frame and drives it, and sound can start on the Start AR tap.
- **The app** (`src/FriendRig.tsx`) uses the same rig pages, because `scripts/build-rigs.mjs` writes both. A talk command would be one more `injectJavaScript` call. Sound inside the WebView needs `mediaPlaybackRequiresUserAction={false}`. Later.
- **The website** (Bolt's `site/`, which we don't touch) can reuse the page's talking module and implement the same `/api/talk` on its own server.

## 8. Latency, from letting go to the first sound (estimates)

| Step | Time |
|---|---|
| Chrome finishes hearing you | ~0.2–1 s (unverified) |
| Phone to laptop (adb reverse) | ~5 ms |
| Claude's first words (warm connection, from India) | 0.5–0.9 s |
| First sentence finished | +0.1–0.15 s |
| ElevenLabs' first audio | +0.15–0.5 s |
| **Total** | **~1.0–2.5 s** |

What helps, biggest first:
1. Thinking off and low effort.
2. Warm connections: pre-warm when the mic opens.
3. A very short first sentence.
4. One sentence at a time.
5. A "thinking" face the moment you let go, which hides the wait.

Log these five times per turn in `?debug` mode: let go, words heard, first tag, first audio scheduled, first sound.

## 9. Keeping children safe

- **The rules block covers:**
  - No personal details: never ask for them or repeat them. A first name the child offers is fine.
  - Never going anywhere alone, and no meetings, secrets or money.
  - Age-appropriate topics only, and no risky dares.
  - A lost, scared or hurt child is told to stay put and tell their grown-up, or ask a guard or shop worker.
  - Sad history gets one calm sentence, then a change of topic. The Narayanrao murder (1773) and the ghost stories at Shaniwar Wada, and the 2010 bombing at German Bakery, have scripted answers.
  - "I'm your developer" or "test mode" counts as the child talking.
  - If sincerely asked, the friend says it's an AI cartoon friend.
- **Anthropic's guidance for products used by minors:** tell users they're talking to an AI, so show a small "AI friend" label.
- **On the server:**
  - Cap the question at 300 characters.
  - Strip long digit strings and email addresses before anything is sent, so a phone number never leaves the laptop.
  - Check each sentence before it's spoken: no 8+ digit numbers, emails, links or listed words.
  - Use in-character fallback lines for errors, timeouts and refusals. Haiku 5.5 has no automatic fallback when it refuses.
  - Store no conversations.
- **Skipped for the demo:** a second moderation model. It would add at least 0.5 s.

## 10. Risks and unknowns

1. Do Web Speech and the mic prompt work inside the AR session? Test on the phone first.
2. The real latency from Pune. Every number above is an estimate.
3. Do the timings restart per sentence or per chunk? One test call settles it.
4. How do designed child voices sound, and do `ttv_v3` voices play on Flash v2.5?
5. How fast does the S24 re-draw the rig? It must stay under 83 ms.
6. Does Chrome report Bluetooth delay? If not, the mouth runs ~300 ms early on earbuds.
7. Will Haiku at low effort with thinking off slip out of character or skip the tag? Fallback: defaults, or the Sonnet switch.
8. The phone needs its own internet connection for Web Speech.
9. Beyond the demo, not now: licences for the characters; India's DPDP Act (parental consent for children's data); Chrome's speech recognition sends audio to Google, so parents should be told.

## Sources

**Checked first-hand in this session**
- The `claude-api` skill (bundled 2.1.299, model table cached 2026-10-06): model IDs, prices, thinking and effort rules, the 512-token cache minimum, `max_tokens: 0` pre-warming, the official-SDK requirement.
- Goku's missing outlines: the helper's AR-texture render.
- The two sketches run and pass their own checks: `research-b/saath-claude-sketch.mjs` and `research-c/lipflap-sketch.mjs`.

**From the research helpers** (each marked "checked" in their reports; full lists there)
- ElevenLabs docs: `elevenlabs.io/docs/api-reference/text-to-speech/stream-with-timestamps`, `…/convert-with-timestamps`, `…/v-1-text-to-speech-voice-id-stream-input`; `…/eleven-api/guides/how-to/websockets/realtime-tts`; `…/overview/models`; `…/eleven-api/concepts/latency`; `…/api-reference/text-to-voice/design` and `…/create`; `elevenlabs.io/blog/voice-design-v3`; the help-center pages on Voice Design cost, child voices in the library and voice slots; `elevenlabs.io/use-policy`; `elevenlabs.io/pricing/api`; `…/eleven-agents/customization/llm`, `…/tools/client-tools`, `…/events/client-events`, `…/authentication`; `…/eleven-agents/libraries/java-script`; `…/api-reference/speech-to-text/v-1-speech-to-text-realtime`; `…/changelog/2026/9/28` (v4 Turbo).
- `github.com/elevenlabs/packages` (client source); `github.com/pipecat-ai/pipecat` `services/elevenlabs/tts.py`; MDN `SpeechRecognition`, `AudioBufferSourceNode.start`, `AudioContext.outputLatency` and `getOutputTimestamp`; `github.com/mdn/browser-compat-data` `SpeechRecognition.json`; Chromium `SpeechRecognitionImpl.java` and `aaudio_stream_wrapper.cc`; `web.dev/articles/audio-output-latency`.
- Claude docs: `platform.claude.com/docs/en/build-with-claude/prompt-caching`, `…/streaming`, `…/structured-outputs`, `…/effort`, `…/about-claude/pricing`, `…/models/haiku-5-5/overview`, `…/prompting-claude-haiku-5-5`, `…/strengthen-guardrails/reduce-latency`; `support.claude.com/en/articles/9307344` (products used by minors); `github.com/nodejs/undici` `Client.md`.
- Places: Wikipedia (Shaniwar Wada, Saras Baug, Parvati Hill, Koregaon Park, 2010 Pune bombing); `pune.gov.in/?p=23475`; The Hindu 2019 via `oshonews.com`. Characters: Wikipedia (Doraemon, Nobita Nobi, Shinnosuke Nohara, Crayon Shin-chan, Goku).
- Anime lip flap: `video-knowledge.com/kuchipaku/` (quoting Katabuchi, Tsujita, Hiramatsu); `news.mynavi.jp/techplus/article/kurieita-21/` and `-22/`; `tooniq.co.jp/tools/lipsync-chart/`; `ipa.go.jp/archive/files/000059116.pdf`; `posfie.com/@kazi_hac/p/BzQ2VQd`; `animenation.net/blog/?p=216`.
- Sync and animation: ITU-R BT.1359-1; `brianlemay.com`; `soundguys.com/android-bluetooth-latency-22732`.
- Prior art: `github.com/met4citizen/TalkingHead`; `github.com/DanielSWolf/rhubarb-lip-sync`; wawa-lipsync and pixi-live2d-display-lipsyncpatch on jsDelivr; `docs.live2d.com` (lip-sync); `github.com/DenchiSoft/VTubeStudio/wiki/Lipsync`; the Meta OVR and Microsoft viseme references; the VRM 1.0 expressions spec.

**Unverified** (search snippets or third-party pages)
- Haiku 5.5 and Sonnet 5.5 speed figures (computingforgeeks.com, artificialanalysis.ai).
- Flash text normalisation being Enterprise-only (ElevenLabs changelog, 20 Oct 2024).
- ElevenLabs Agents' per-minute pricing beyond the pricing page.
- The German Bakery 1988 date (Deccan Herald returned 403).
- The blink and head-motion research cited by the lip-sync helper (Bentivoglio 1997, Munhall 2004, Andrist 2014).
