import { VOICES, pickEnglishVoice } from './voices';
import { SUPABASE_ANON_KEY, TALK_URL } from './talk';

/**
 * Lazy-loaded Kokoro TTS, shared across every chat.
 * WebGPU only: on devices without a usable GPU adapter we skip Kokoro entirely
 * and fall back to speechSynthesis, since single-threaded WASM is far too slow.
 * The model is fetched only once per page load, and only after the first chat
 * opens, so the map page stays light.
 */

export type KokoroStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export type SpeakHandle = {
  cancel: () => void;
  /** Resolves when the voice has finished (or was cancelled); false when it couldn't play at all. */
  done: Promise<boolean | void>;
  /** The playing voice when it is a sound file (ElevenLabs): the talking mascot follows its time and loudness. */
  audio?: HTMLAudioElement;
};

/** Resolves once speechSynthesis stops speaking (capped at 20 s). */
async function synthDone(): Promise<void> {
  const synth = window.speechSynthesis;
  await new Promise((r) => setTimeout(r, 300));
  const started = Date.now();
  while (synth?.speaking && Date.now() - started < 20_000) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const SLOW_GENERATION_MS = 8000;

type RawAudio = { toBlob: () => Blob };
type KokoroTTS = {
  generate: (text: string, opts: { voice?: string; speed?: number }) => Promise<RawAudio>;
};
type KokoroModule = {
  KokoroTTS: { from_pretrained: (id: string, opts: { dtype: string; device: string }) => Promise<KokoroTTS> };
};
type GpuNavigator = Navigator & { gpu?: { requestAdapter: () => Promise<null | unknown> } };

let ttsPromise: Promise<KokoroTTS> | null = null;
let ttsInstance: KokoroTTS | null = null;
let ttsState: KokoroStatus = 'idle';
const stateListeners = new Set<(s: KokoroStatus) => void>();

function setState(next: KokoroStatus) {
  ttsState = next;
  for (const fn of stateListeners) fn(next);
}

export function subscribeKokoroState(fn: (s: KokoroStatus) => void): () => void {
  stateListeners.add(fn);
  fn(ttsState);
  return () => stateListeners.delete(fn);
}

export function kokoroReady(): boolean {
  return ttsState === 'ready' && ttsInstance !== null;
}

export function kokoroUnavailable(): boolean {
  return ttsState === 'unavailable';
}

/** True only if WebGPU is actually usable (an adapter can be acquired). */
async function hasWebGpu(): Promise<boolean> {
  const nav = navigator as GpuNavigator;
  if (!nav.gpu?.requestAdapter) return false;
  try {
    const adapter = await nav.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Begin loading Kokoro (WebGPU/fp32). Resolves to the instance.
 * If there is no usable WebGPU adapter, marks it unavailable and rejects.
 * Safe to call multiple times — the load is shared.
 */
export function loadKokoro(): Promise<KokoroTTS> {
  if (ttsInstance) return Promise.resolve(ttsInstance);
  if (ttsPromise) return ttsPromise;
  setState('loading');
  ttsPromise = (async () => {
    if (!(await hasWebGpu())) {
      throw new Error('kokoro-no-webgpu');
    }
    const mod = (await import('kokoro-js')) as unknown as KokoroModule;
    const instance = await mod.KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'fp32',
      device: 'webgpu',
    });
    ttsInstance = instance;
    setState('ready');
    return instance;
  })().catch((err) => {
    ttsPromise = null;
    setState('unavailable');
    throw err;
  });
  return ttsPromise;
}

/** Fallback: the old speechSynthesis path. */
function speakFallback(friendId: string, text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const settings = VOICES[friendId]?.fallback;
  if (settings) {
    utterance.pitch = settings.pitch;
    utterance.rate = settings.rate;
  }
  const voice = pickEnglishVoice(synth.getVoices());
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? 'en-IN';
  synth.speak(utterance);
}

function playBlob(blob: Blob, rate: number): HTMLAudioElement {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.playbackRate = rate;
  audio.preservesPitch = false;
  const anyAudio = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean };
  anyAudio.webkitPreservesPitch = false;
  void audio.play().catch(() => {
    // Autoplay refusal — nothing useful to do silently.
  });
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  audio.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
  return audio;
}

/** Split a reply into sentences so the first one can start playing quickly. */
function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+|(?:\n)+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

type PlaybackController = {
  cancel: () => void;
};

/** Generate + play each sentence in order. Cancel stops the current audio and queue. */
async function speakWithKokoro(
  tts: KokoroTTS,
  friendId: string,
  voice: string,
  rate: number,
  sentences: string[],
): Promise<SpeakHandle> {
  let cancelled = false;
  let currentAudio: HTMLAudioElement | null = null;

  const controller: PlaybackController = {
    cancel: () => {
      cancelled = true;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
      }
    },
  };

  // Drive generation + playback sequentially without blocking the returned handle.
  const done = (async () => {
    for (const sentence of sentences) {
      if (cancelled) return;
      try {
        const audio = await Promise.race([
          tts.generate(sentence, { voice }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('kokoro-slow')), SLOW_GENERATION_MS),
          ),
        ]);
        if (cancelled) return;
        const blob = audio.toBlob();
        const el = playBlob(blob, rate);
        currentAudio = el;
        await new Promise<void>((resolve) => {
          el.addEventListener('ended', () => resolve(), { once: true });
          el.addEventListener('error', () => resolve(), { once: true });
        });
        currentAudio = null;
      } catch {
        // A single slow/failed sentence doesn't kill the whole reply:
        // fall back to speechSynthesis for the remaining text, then stop.
        if (!cancelled) {
          speakFallback(friendId, sentence);
          await synthDone();
        }
        return;
      }
    }
  })();

  return { cancel: controller.cancel, done };
}

/**
 * Speak a reply. Tries Kokoro sentence-by-sentence; falls back to
 * speechSynthesis if Kokoro is unavailable or a generation times out.
 */
export async function speakReply(friendId: string, text: string): Promise<SpeakHandle> {
  if (await elevenAvailable()) {
    const eleven = await speakWithEleven(friendId, text);
    if (eleven) return eleven;
  }
  const settings = VOICES[friendId]?.kokoro;

  if (!settings || kokoroUnavailable()) {
    speakFallback(friendId, text);
    return { cancel: () => window.speechSynthesis?.cancel(), done: synthDone() };
  }

  try {
    const tts = await loadKokoro();
    const sentences = splitSentences(text);
    return await speakWithKokoro(tts, friendId, settings.voice, settings.rate, sentences);
  } catch {
    // Load failure (e.g. no WebGPU) — use the fallback voice.
    speakFallback(friendId, text);
    return { cancel: () => window.speechSynthesis?.cancel(), done: synthDone() };
  }
}

let elevenStatus: Promise<boolean> | null = null;

/** True when the talk function has an ElevenLabs key (asked once per page load). */
export function elevenAvailable(): Promise<boolean> {
  elevenStatus ??= fetch(TALK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ mode: 'voice-status' }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: unknown) => typeof d === 'object' && d !== null && (d as { eleven?: unknown }).eleven === true)
    .catch(() => false);
  return elevenStatus;
}

/** Audio already fetched for a line, so ▶ replay doesn't pay for the same speech twice. */
const elevenClips = new Map<string, string>();

/** Speak with the friend's ElevenLabs voice. Resolves null on any failure so callers can fall back. */
async function speakWithEleven(friendId: string, text: string): Promise<SpeakHandle | null> {
  const key = `${friendId}:${text}`;
  let url = elevenClips.get(key);
  if (!url) {
    try {
      const response = await fetch(TALK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ mode: 'speak', friendId, text }),
        signal: AbortSignal.timeout?.(20000),
      });
      if (!response.ok) {
        console.warn('ElevenLabs voice unavailable', response.status, await response.text().catch(() => ''));
        return null;
      }
      url = URL.createObjectURL(await response.blob());
      elevenClips.set(key, url);
    } catch {
      return null;
    }
  }
  const audio = new Audio(url);
  let finish!: (played: boolean) => void;
  const done = new Promise<boolean>((resolve) => { finish = resolve; });
  audio.addEventListener('ended', () => finish(true), { once: true });
  audio.addEventListener('error', () => finish(false), { once: true });
  audio.play().catch(() => finish(false)); // autoplay blocked: don't leave the hangout waiting forever
  return { cancel: () => { audio.pause(); finish(true); }, done, audio };
}

/** Stop any speech playback in flight. */
export function stopAllSpeaking() {
  window.speechSynthesis?.cancel();
}
