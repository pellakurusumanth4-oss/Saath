// The mascot on the talk screen, alive while you talk to it: it listens (small nods, head tilted), thinks (eyes up and
// away), then answers in its voice with lips from the sound, a face that follows the words, hands on the words that
// need them and hair that swings. Drawn live from the mascot design (talkRig.js, loaded when the screen opens), waist
// up like a video call. The still figure stands in while it loads, if it can't, and for anyone who asks for reduced motion.
import { useEffect, useRef, useState } from 'react';
import type { Mascot } from './mascots';
import { Podium } from './ui';
import type { Performance as Director, Rig, Talk } from './talkRig';
import type { Timing } from './kokoro';

export type Speech = { key: number; text: string; audio?: HTMLAudioElement; timing?: Timing };
type State = 'idle' | 'listening' | 'thinking' | 'talking';
type Live = { rig: Rig; director: Director; mod: typeof import('./talkRig'); clock: number; last: number; until: number; audio?: HTMLAudioElement; t0?: number };

const FADE = 'linear-gradient(to bottom, #000 78%, transparent 99%)';   // the body fades out at the hips
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export default function TalkingMascot({ mascot, color, state, speech, grey = false }: {
  mascot: Mascot; color: string; state: State; speech: Speech | null; grey?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const live = useRef<Live | null>(null);
  const prev = useRef(state);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(reduced);   // reduced motion keeps the still figure, as the rest of the site keeps still

  useEffect(() => {
    if (failed) return;
    let raf = 0, tick = 0, gone = false;
    const slow = window.setTimeout(() => { if (!live.current) setFailed(true); }, 5000);   // a stalled load keeps the still figure
    import('./talkRig').then((mod) => {
      if (gone || !svg.current) return;
      const rig = mod.makeRig(mascot.id);
      rig.make(svg.current, rig.VB.waist);
      const L: Live = { rig, mod, director: new mod.Performance(rig, null, { live: true, seed: mascot.id.length * 13 }), clock: 0, last: performance.now(), until: 0 };
      live.current = L;
      rig.apply(svg.current, L.director.advance(0).pose());   // drawn before it shows, so the swap from the still figure never blinks
      setReady(true);
      const frame = (now: number) => {
        const dt = Math.min(0.25, (now - L.last) / 1000);
        L.last = now;
        // wall time, and the voice's own time while it plays, so the lips follow the sound even if it stalls
        if (L.audio && L.t0 !== undefined && !L.audio.paused) L.clock = Math.max(L.clock, L.t0 + L.audio.currentTime);
        else L.clock += dt;
        try {
          if (svg.current) rig.apply(svg.current, L.director.advance(L.clock).pose());
        } catch {
          setFailed(true);
          return;
        }
        // about 30 drawings a second while a reply plays (smooth lips), 8 otherwise (breathing, blinks)
        tick = window.setTimeout(() => { raf = requestAnimationFrame(frame); }, L.clock < L.until ? 30 : 120);
      };
      raf = requestAnimationFrame(frame);
    }).catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; window.clearTimeout(slow); window.clearTimeout(tick); cancelAnimationFrame(raf); live.current = null; setReady(false); };
  }, [mascot.id, failed]);

  // the talk screen's state: listening, thinking, or the reply over (done, or cut off by a new question)
  useEffect(() => {
    const L = live.current;
    const from = prev.current;
    prev.current = state;
    if (!L || state === 'talking') return;   // a reply starts when its voice does (below)
    // listening -> thinking leaves the listen open, so think() closes it with a "got it" nod
    if (!(state === 'thinking' && from === 'listening')) L.director.stop(L.clock);
    L.audio = undefined;
    L.t0 = undefined;
    if (state === 'listening') L.director.listen(L.clock);
    else if (state === 'thinking') L.director.think(L.clock);
  }, [state, ready]);

  // a reply: line its words up with the voice (by ElevenLabs' letter timings when it sent them, else from the sound;
  // estimated for the browser's own voice), then perform it
  useEffect(() => {
    const L = live.current;
    if (!L || !speech) return;
    let gone = false;
    const a = speech.audio;
    const start = (talk: Talk) => {
      if (gone || live.current !== L || (a && a.paused)) return;   // cut off while it was being read
      L.audio = a;
      L.t0 = L.clock - (a ? a.currentTime : 0);
      L.until = L.t0 + talk.dur + 1;
      L.director.speak(talk, L.t0);
    };
    const estimate = () => start(L.mod.estimateSpeech(speech.text));
    if (a?.src) {
      fetch(a.src).then((r) => r.arrayBuffer())
        .then((buf) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf))
        .then((sound) => start(speech.timing ? L.mod.alignTimed(sound.getChannelData(0), sound.sampleRate, speech.timing)
          : L.mod.alignSpeech(speech.text, sound.getChannelData(0), sound.sampleRate)))
        .catch(estimate)
        .catch(() => setFailed(true));   // the rig itself failed: the still figure, not a broken page
    } else {
      try { estimate(); } catch { setFailed(true); }
    }
    return () => { gone = true; };
  }, [speech, ready]);

  const still = <Podium mascot={mascot} color={color} height={260} grey={grey} className="talk-podium" />;
  if (failed) return still;
  return (
    <>
      {!ready && still}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, maskImage: FADE, WebkitMaskImage: FADE,
        filter: grey ? 'grayscale(1) contrast(.85) brightness(1.06)' : undefined, opacity: ready ? 1 : 0 }}>
        <svg ref={svg} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </div>
    </>
  );
}
