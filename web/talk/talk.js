// Saath's talking engine for any page that shows a friend's rig: hold to talk (Chrome's speech recognition, or a
// recording the server writes down where the browser can't hear), the reply from /api/talk (web/talk/server.mjs),
// its voice, and the face to draw each frame. A plain ES module with no dependencies: the AR page uses it now, the
// app's WebView or the website later.
//   createTalk({ friend, onEvent, lip }) -> { listen(), send(text?), stop(), warm(), face(), cloud(), state }
//   onEvent(type, data): 'state' (idle | listening | thinking | speaking), 'heard' (text), 'cue' ({emotion, action}),
//   'error' (a message to show), 'timing' ({name, ms} since letting go: heard, cue, audio, sound).
//   face() -> {mood, mouth: 'closed'|'half'|'open'} while he thinks or talks, for the rig's saath.face() each frame;
//   then null when he has finished (his own face; a gesture held back until he stopped talking plays now), or false
//   when he was cut off or the reply failed (his own face, and that gesture is dropped).
//   cloud() -> {thinking: true} | {text} | null: what he is doing or saying, for tests (since 18 Oct the AR page shows no words).
//   lip: seconds added to the audio clock, to line the mouth up by hand (e.g. Bluetooth earbuds).
import { MOUTH, closures, loudness, mouthAt } from './mouth.mjs';

export const NOT_HEARD = 'Didn’t catch that. Hold and try again.';
const OOPS = 'Oops, I can’t talk right now. Try again?', NOT_ALLOWED = 'Allow the microphone to talk.';
const KEEP = 8, FORGET_MS = 10 * 60 * 1000, HOLD_S = 1.5, RATE = 24000;
// Chrome's errors when there is no speech service behind the API (Chromium builds, Electron): those record instead.
const NO_SERVICE = ['network', 'service-not-allowed', 'language-not-supported'];

// One line of the response body at a time (the server sends one JSON object per line).
async function* lines(body) {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) if (buf.slice(0, i).trim()) yield buf.slice(0, i);
  }
  if (buf.trim()) yield buf;
}

export function createTalk({ friend, onEvent, lip = 0 }) {
  let state = 'idle', rec = null, recorder = null, held = false, heard = '', finished = false, cut = false, lateError = '';
  // Brave has the speech API but nothing behind it (it fails at once) and Firefox has none: both record.
  let noSR = 'brave' in navigator;
  let ctx = null, turn = 0, ac = null, sources = [], next = 0, firstAt = 0, sounds = [], emotion = 'neutral';
  let history = [], lastTalk = 0, t0 = 0, sounded = false, warmedAt = -1e9;
  const set = (s) => { if (s !== state) { state = s; onEvent('state', s); } };
  const time = (name) => onEvent('timing', { name, ms: Math.round(performance.now() - t0) });
  // Made on a press or a tap, as browsers only let sound start from one.
  const audio = () => { ctx ??= new AudioContext({ latencyHint: 'interactive' }); if (ctx.state === 'suspended') ctx.resume(); };
  // The audio clock at the sound reaching the ear now: the output timestamp where the browser gives one.
  const heardAt = () => {
    const ts = ctx.getOutputTimestamp?.();
    return (ts?.contextTime ? ts.contextTime + (performance.now() - ts.performanceTime) / 1000 : ctx.currentTime - (ctx.outputLatency || 0)) + lip;
  };
  const hush = () => { for (const s of sources) try { s.stop(); } catch {} sources = []; sounds = []; next = firstAt = 0; };

  // One chunk of 16-bit 24 kHz speech, queued right after the last. Each sentence also keeps its samples (from where
  // it starts playing; a late chunk is padded with silence so they stay in step), its lip closures (a sentence's
  // first chunk carries the timings of the whole sentence) and its text. face() reads the mouth from them
  // (web/talk/mouth.mjs), cloud() the words.
  const play = (o) => {
    const bytes = Uint8Array.from(atob(o.pcm), (c) => c.charCodeAt(0)), pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    if (!pcm.length) return;
    const buf = ctx.createBuffer(1, pcm.length, RATE), ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);
    const at = Math.max(next, ctx.currentTime + 0.05);
    src.start(at); sources.push(src); next = at + buf.duration;
    const s = (sounds[o.s] ??= { at, pcm: new Float32Array(0), ref: 0, shut: [], text: o.text });
    const from = Math.max(s.pcm.length, Math.round((at - s.at) * RATE)), all = new Float32Array(from + ch.length);
    all.set(s.pcm); all.set(ch, from);
    s.pcm = all; s.ref = loudness(all);
    if (o.chars.length) s.shut = closures(o);
    if (!firstAt) { firstAt = at; time('audio'); }
  };

  const ask = async (text) => {
    text = text.slice(0, 300);   // the server takes 300 characters, and recognition can run on
    onEvent('heard', text); time('heard');
    if (Date.now() - lastTalk > FORGET_MS) history = [];
    const my = ++turn;
    ac = new AbortController(); hush(); emotion = 'neutral'; sounded = false; finished = false; cut = false; lateError = '';
    set('thinking');
    try {
      const res = await fetch('/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ friend, text, history }), signal: ac.signal });
      if (!res.ok) { if (res.status === 400) history = []; throw new Error(OOPS); }   // history it turns down is forgotten
      for await (const line of lines(res.body)) {
        if (my !== turn) return;   // interrupted: a late chunk of an old reply
        const o = JSON.parse(line);
        if (o.type === 'cue') { emotion = o.emotion; time('cue'); onEvent('cue', { emotion: o.emotion, action: o.action }); }
        else if (o.type === 'audio') { play(o); set('speaking'); }
        // The server takes 400 characters a message; a long reply (5 sentences) can be about 800.
        else if (o.type === 'done') { history = [...history, { role: 'user', content: text }, { role: 'assistant', content: o.reply.slice(0, 400) }].slice(-KEEP); lastTalk = Date.now(); }
        else if (o.type === 'error') throw new Error(o.message);
      }
      finished = true;   // all of it has come: once its voice ends, he's done
      if (!firstAt) throw new Error(OOPS);
    } catch (e) {
      if (my !== turn) return;
      const message = e.name === 'AbortError' || e.name === 'TypeError' ? OOPS : e.message;
      // Failing after he has started talking (the voice failed on a later sentence, or the deadline): he finishes what
      // is queued and face() shows the message after, instead of stopping mid-word.
      if (firstAt) { finished = true; lateError = message; return; }
      hush(); cut = true; set('idle'); onEvent('error', message);
    }
  };

  // Chrome turns speech into words as you talk. It stops at a pause (on Android always), so while the button is still
  // held it listens again and the words add up. Indian English, as the friends answer in English.
  const recognise = (SR, my) => {
    const r = (rec = new SR()), before = heard, from = performance.now();
    let why = '';
    Object.assign(r, { lang: 'en-IN', interimResults: true, continuous: false, maxAlternatives: 1 });
    // With continuous on, Chrome on Android repeated the words so far in each new result ("what arewhat are you
    // doing", 18 Oct), so they are joined without repeats.
    r.onresult = (e) => {
      const said = Array.from(e.results, (x) => x[0].transcript).reduce((all, t) => (t.trim().toLowerCase().startsWith(all.trim().toLowerCase()) ? t : all + t), '');
      heard = `${before} ${said.trim()}`.trim();
      onEvent('heard', heard);
    };
    r.onerror = (e) => { why = e.error; };
    r.onend = () => {
      if (rec === r) rec = null;
      if (my !== turn || state !== 'listening') return;   // stopped on purpose
      if (NO_SERVICE.includes(why)) { noSR = true; if (held) return record(my); }
      // A pause: listen on. Not after an error, or an end too quick to be a pause, which would only repeat.
      if (held && (!why || why === 'no-speech') && performance.now() - from > 250) return recognise(SR, my);
      if (heard) ask(heard); else { onEvent('error', why === 'not-allowed' ? NOT_ALLOWED : NOT_HEARD); set('idle'); }
    };
    try { r.start(); } catch { rec = null; if (heard) ask(heard); else { onEvent('error', NOT_HEARD); set('idle'); } }
  };

  // Browsers that can't turn speech into words (Brave, Firefox): record while the button is held; then the server has
  // ElevenLabs Scribe write it down (/api/hear) and the question goes on as usual, about 0.8 s later than in Chrome.
  const record = async (my) => {
    let stream, r;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      r = new MediaRecorder(stream, { ...(type && { mimeType: type }), audioBitsPerSecond: 32000 });
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      if (my === turn) { onEvent('error', e?.name === 'NotAllowedError' ? NOT_ALLOWED : 'This browser can’t hear you. Try Chrome.'); set('idle'); }
      return;
    }
    if (my !== turn || !held) {   // let go, or stopped, before the mic was ready
      stream.getTracks().forEach((t) => t.stop());
      if (my === turn) { onEvent('error', NOT_HEARD); set('idle'); }
      return;
    }
    const parts = [], from = performance.now();
    recorder = r;
    r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recorder === r) recorder = null;
      if (my !== turn) return;   // stopped on purpose: only the mic is freed
      if (performance.now() - from < 400) { onEvent('error', NOT_HEARD); set('idle'); return; }   // a tap, not a question
      set('thinking');
      const type = r.mimeType.split(';')[0];
      let out = { error: OOPS };
      try { out = await (await fetch('/api/hear', { method: 'POST', headers: { 'content-type': type }, body: new Blob(parts, { type }) })).json(); } catch {}
      if (my !== turn) return;
      const said = out.text?.trim();
      if (said) ask(said); else { onEvent('error', out.error || NOT_HEARD); set('idle'); }
    };
    r.start();
  };

  const talk = {
    get state() { return state; },
    // The server opens its connections while you are still talking, so the reply starts sooner (at most every 3 s).
    warm() {
      if (performance.now() - warmedAt < 3000) return;
      warmedAt = performance.now();
      fetch('/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ friend, warm: true }) }).catch(() => {});
    },
    // Press: listen, cutting off anything he is saying.
    listen() {
      talk.stop(); audio(); talk.warm();
      heard = ''; held = true;
      set('listening');
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR && !noSR) recognise(SR, turn); else record(turn);
    },
    // Let go: what was heard goes when recognition (or the recording) ends. With text, that is sent at once.
    send(text) {
      t0 = performance.now();
      if (typeof text !== 'string') { held = false; rec?.stop(); if (recorder?.state === 'recording') recorder.stop(); return; }
      const t = text.trim().slice(0, 300);
      if (t) { talk.stop(); audio(); ask(t); }
    },
    // Stops listening and talking at once; a reply still on its way is dropped.
    stop() {
      if (state === 'thinking' || state === 'speaking') cut = true;
      lateError = '';
      turn++; held = false; ac?.abort(); if (ctx) hush();
      if (recorder?.state === 'recording') recorder.stop();   // its onstop sees the new turn and only frees the mic
      if (rec) { const r = rec; rec = null; set('idle'); r.abort(); } else set('idle');
    },
    face() {
      if (state === 'thinking') return { mood: 'thinking', mouth: 'closed' };
      if (state !== 'speaking') return cut ? false : null;
      const t = heardAt();
      if (t < firstAt) return { mood: 'thinking', mouth: 'closed' };   // the voice is on its way to the speaker
      if (!sounded) { sounded = true; time('sound'); }
      // Done once all of the reply has come and its voice has ended; a sentence that comes late only makes a pause.
      if (finished && t > next + HOLD_S) {
        if (!lateError) { set('idle'); return null; }
        cut = true; set('idle'); onEvent('error', lateError); lateError = ''; return false;   // the reply failed part-way
      }
      // The shape for the next 83 ms of voice, asked every frame: the rig shows it from its next drawing.
      const s = sounds.findLast((x) => x && x.at <= t);
      return { mood: emotion, mouth: MOUTH[s ? mouthAt(s, t - s.at) : 'X'] };
    },
    // Three dots while he thinks (until his voice reaches you), then the sentence he is saying; null once face() has
    // seen him finish.
    cloud() {
      if (state === 'thinking') return { thinking: true };
      if (state !== 'speaking') return null;
      const t = heardAt(), s = sounds.findLast((x) => x && x.at <= t);
      return s ? { text: s.text } : { thinking: true };
    },
  };
  return talk;
}
