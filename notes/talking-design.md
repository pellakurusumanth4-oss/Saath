# Talking friends: design

**Status:** approved by the user on 17 Oct 2026, with these answers:
- **Language:** English with a few Hindi words.
- **Bolt:** build here first; moving it into Bolt is a follow-up.
- **Who builds:** this session, task by task.
**Research:** `notes/talking-characters.md`.
**Plan:** `notes/talking-plan.md`, written once this design is approved.

## What and why

At a friend's spot you meet them on your real floor in AR. Today they wave, and a bubble says "Hi! I'm Nobita!".

This design makes them talk back:
- You hold a button and ask something.
- They answer in their own voice within about 1.5 s.
- Their mouth moves with the words, their face shows the feeling, and they do something that fits.

This is Saath's core feature for the Bolt Builders Week demo, due 21 Oct at 12:29 PM IST.

**The feel (your words, 17 Oct):** "all characters need to be friendly", and "normal conversations". So it's everyday chat, not a history lesson. The friend knows his place and brings it up only when it fits.

Example: a child at Sarasbaug asks Nobita "what are you doing?" He yawns, says you woke him from his nap, and asks what you're up to.

## Done when

- On the S24, in the AR page, you can ask Nobita something by voice, then the other three friends.
- He starts answering within about 1.5 s of you letting go of the button.
- His mouth moves with the words, anime style: closed, half and open.
- His face shows the feeling (happy, surprised, sad and so on), using the parts his rig already has.
- He plays a fitting clip of his own (wave, nap, cheer and so on).
- You approve each friend's looks and voice.

## Not now

- **The Expo app's camera view and Bolt's website.** The engine is built so both can reuse it (see "The protocol").
  - The contest rules (from the 16 Oct design) say core features must run in Bolt on `bolt.host`, live until 31 Oct, and voice chat is listed as must-ship.
  - So the server core, `talk()`, uses only `fetch`, the Anthropic SDK and JS modules: no file reads and no Node `http`. `serve.mjs` wraps it here, and a Bolt server function can wrap it the same way.
  - Moving it into Bolt, with a per-user rate limit because judges and the public can reach it there, is a separate follow-up.
- **Left out:**
  - hands-free listening
  - a spoken greeting when he appears
  - subtitles
  - a fourth "round" mouth
  - emotion in the voice itself (Eleven v4 tags)
  - new face drawings, such as eyebrows for Doraemon
  - a second safety model
  - rate limiting (the server only runs on the laptop)

## Must never happen

- An API key in the page, the app, a commit or the chat.
- An approved drawing changed without your yes. Every change goes into the injected camera mode, never into the design files.
- A friend asking a child for personal details, or suggesting they go anywhere alone.
- A voice that copies a real person: no cloning, and no naming of the shows' voice actors.

## Constraints

- **AR page first:** Chrome with WebXR on the S24. The laptop server, `web/serve.mjs` on port 8099, is reached through `adb reverse`.
- **Keys** live in `.env.local` at the project root. Your `.env` was renamed to this, so the `.gitignore` rule `.env*.local` now covers it. It holds:
  - `ELEVEN_LABS_API_KEY`, which is in and works;
  - `CLAUDE_API_KEY`, which is in and works (checked: it can reach Haiku 5.5 and Sonnet 5.5).

  The key file must never go in `web/`, because `serve.mjs` hands out any file under `web/`.
- **No touching the phone, and no git,** without your go-ahead.
- **Spending:** you said to use what's needed.
  - ElevenLabs is on the Free plan: 10,000 credits a month, of which a reply uses about 60.
  - Automated tests use recorded replies, so they cost nothing.
  - Rough budget: about 1,000 credits for voices, about 3,500 for phone tests, and the rest for the demo.

## How it works

```
Phone: AR page in Chrome         Laptop: serve.mjs                     Cloud
hold the mic button
Chrome hears you (en-IN)
let go ── POST /api/talk ──────▶ check input, add the friend's prompt
         {friend, text, history}  ──────────────────────────────────▶ Claude Haiku 5.5 (streamed)
                                  "[happy|wave] Oh! You woke me up! …"
       ◀── cue {happy, wave} ──── first line, as soon as the tag arrives
face → happy, clip → Hi!          each sentence ───────────────────▶ ElevenLabs Flash v2.5
       ◀── audio + char times ─── per chunk, in order                 (raw audio + the time of each character)
plays the audio without gaps;
mouth = closed/half/open from
the char times, 12 a second
       ◀── done {reply} ───────── reply kept for the next turn's history
```

### The pieces

| Piece | Where | What it does |
|---|---|---|
| Rig hook | `scripts/rig-ar.js`, `scripts/build-rigs.mjs` | `saath.face({mouth, mood})` lays a face over any clip. `saath.act(word)` plays the clip for an action word. Per-rig name tables use existing parts only. Rebuilt into `web/ar/rigs/` and the app's `src/rigs.ts`. |
| Talk server | `web/talk/server.mjs`, `reply.mjs`, `prompts/`, `voices.json`, hooked into `web/serve.mjs` | `/api/talk` streams one JSON object per line. It checks the input and never logs content or keys. |
| Talk client | `web/talk/talk.js`, `mouth.js` | Hold-to-talk speech recognition, the request, gapless audio and the mouth timeline. The page asks `face()` for the current face each frame. |
| AR page | `web/ar/index.html` | Mic button, "AI friend" label, a caption of what was heard, and a text box. Calls `face()` every frame and `act()` on the cue. |
| Voice maker | `scripts/voices.mjs` | Makes 3 Voice Design previews per friend. You pick one, and its id goes into `voices.json`. |

### The protocol (for reuse by the app and the website)

**Request:** `POST /api/talk` with `{friend: "nobita", text: "…", history: [{role: "user" | "assistant", content}]}`. History holds at most 8 messages.

**Response:** `application/x-ndjson`, one JSON object per line:
- `{"type": "cue", "emotion": "happy", "action": "wave"}` comes first.
- `{"type": "audio", "s": 0, "text": "Oh!", "pcm": "<base64, 16-bit mono 24 kHz>", "chars": […], "starts": […], "ends": […]}`: one per chunk, where `s` is the sentence number. `text` is the sentence as written, for the cloud over his head (added 18 Oct); `chars` are as spoken, so "129.3" may come spelled out.
- `{"type": "done", "reply": "[happy|wave] Oh! You woke me up! …"}` comes last.
- `{"type": "error", "message": "…"}` replaces whatever is left if something fails.

**Hearing, for browsers that can't (added 18 Oct):** `POST /api/hear` with the recording as the body: `audio/webm`, `ogg`, `mp4`, `mpeg` or `wav`, up to 2 MB. It answers `{"text": "…"}`, or `{"error": "…"}` to show. The page then asks `/api/talk` as usual.

### Behaviour

- **States:**
  - **idle**
  - **listening:** while you hold the button.
  - **thinking:** his eyes look up, from the moment you let go until the first sound.
  - **speaking**
  - back to **idle**.
- **Interrupting:** holding the button while he talks stops him at once.
- **Nothing heard:** "Didn't catch that. Hold and try again."
- **Anything fails:** a short message shows, he goes back to idle, and the next question still works.
- **Actions that hide or close his face** (Nap, Instant Transmission, Take-copter, Late!) wait until he has finished talking.

## My calls (tell me if you want them different)

1. **Our own pipeline, not ElevenLabs Agents** (research section 1).
2. **Claude:** Haiku 5.5 with thinking off and low effort. Sonnet 5.5 stays a one-line switch.
3. **Hold-to-talk, plus a text box.**
4. **Language:** English replies, with at most one Hindi or Marathi word; Chrome listens for Indian English (`en-IN`). **This one is yours to decide; see below.**
5. **The mouth:** 3 shapes worked out from the letters alone. A loudness curve gets added only if the letters alone look wrong.
6. **Feelings** use existing parts only. You approve a sheet of faces per friend before he talks on the phone.
7. **Libraries:** the official Anthropic SDK as one server-only dependency, because the `claude-api` skill requires it. ElevenLabs is called with plain `fetch`.
8. **The key file** goes at the project root, not in `web/`.
9. **Goku's missing outlines** in AR get fixed as their own small task, which needs your yes.
10. **Voices: three custom voices for now, as you said.**
    - Nobita, Shin-chan and Doraemon get designed voices, which fill the Free plan's 3 slots.
    - Goku gets one of the 21 ready-made voices your account already has (checked: they take no slot), for example Liam "Energetic" or Charlie "Deep, Confident, Energetic".
    - You hear the previews and choose every voice.
    - The Free plan is non-commercial and asks for attribution, so the AR page gets a small "Voices: ElevenLabs" line.
11. **Tone:** the prompts' rules are rewritten for friendly, everyday chat. Place facts come up only when they fit, and the reply doesn't end on a quiz question every time.

12. **If Chrome's speech recognition fails inside AR** (checked on the phone first), the text box still works. Voice would then go through ElevenLabs' own speech-to-text (Scribe): about half a day of work, and the child's voice would go to ElevenLabs instead of Google. I'd ask you before switching.
    - **Done 18 Oct as a fallback, the user's choice.** Brave on the laptop couldn't hear, since it has no speech service. Browsers that can't hear now record while the mic is held, and `POST /api/hear` has Scribe v2 (batch) write it down. Chrome keeps its own recognition.

## Still to confirm

1. **Language.** Unless you say otherwise: English replies with at most the odd Hindi or Marathi word (arre, chalo), and Chrome listens for Indian English (`en-IN`).
   - This has to be settled before the voice previews, because it sets the voices' accent.
   - Hindi works with the fast voice model, as far as the docs show.
   - Marathi likely doesn't; it would need a slower model.
   - Replies in Devanagari script would need new mouth rules, since today's rules read Latin letters.
2. **Bolt by the deadline.** Does talking have to be live in your Bolt entry by Wed 12:29 PM? Either way I build it here first, with the server core kept ready to move. The question is only whether the move needs time reserved this week.

## Left to the builder

- The file layout inside `web/talk/`.
- The test harness.
- Thresholds, tuned on real replies.
- The UI's styling, within the AR page's current look.
