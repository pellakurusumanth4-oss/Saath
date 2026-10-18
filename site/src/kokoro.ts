import { VOICES, pickEnglishVoice } from './voices';

/**
 * Lazy-loaded Kokoro TTS, shared across every chat.
 * The model is fetched only once per page load, and only after the first chat opens,
 * so the map page stays light.
 */

export type KokoroStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export type SpeakHandle = {
  cancel: () => void;
};

export type SpeakOptions = {
  onState?: (state: KokoroStatus) => void;
};

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const SLOW_GENERATION_MS = 8000;

type KokoroTTS = {
  generate: (text: string, opts: { voice?: string; speed?: number }) => Promise<{
    toBlob: () => Blob;
  }>;
};

type KokoroModule = { KokoroTTS: { from_pretrained: (id: string, opts: { dtype: string; device: string }) => Promise<KokoroTTS> } };

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

function device(): string {
  const nav = navigator as Navigator & { gpu?: unknown };
  return nav.gpu ? 'webgpu' : 'wasm';
}

/** Begin loading Kokoro. Resolves to the instance, or rejects on failure. */
export function loadKokoro(): Promise<KokoroTTS> {
  if (ttsInstance) return Promise.resolve(ttsInstance);
  if (ttsPromise) return ttsPromise;
  setState('loading');
  ttsPromise = (async () => {
    const mod = (await import('kokoro-js')) as unknown as KokoroModule;
    const instance = await mod.KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: device(),
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

export function kokoroReady(): boolean {
  return ttsState === 'ready' && ttsInstance !== null;
}

export function kokoroUnavailable(): boolean {
  return ttsState === 'unavailable';
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

/**
 * Speak a reply. Tries Kokoro; falls back to speechSynthesis if Kokoro is
 * unavailable or generation is too slow. Returns a handle to cancel playback.
 */
export async function speakReply(friendId: string, text: string): Promise<SpeakHandle> {
  const settings = VOICES[friendId]?.kokoro;

  // No voice mapping for this friend → straight to fallback.
  if (!settings) {
    speakFallback(friendId, text);
    return { cancel: () => window.speechSynthesis?.cancel() };
  }

  // Kokoro already failed before → fallback.
  if (kokoroUnavailable()) {
    speakFallback(friendId, text);
    return { cancel: () => window.speechSynthesis?.cancel() };
  }

  try {
    const tts = await loadKokoro();
    const started = Date.now();
    const audio = await Promise.race([
      tts.generate(text, { voice: settings.voice }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('kokoro-slow')), SLOW_GENERATION_MS),
      ),
    ]);
    const elapsed = Date.now() - started;
    const blob = audio.toBlob();
    const el = playBlob(blob, settings.rate);
    return { cancel: () => { el.pause(); el.src = ''; } };
  } catch {
    // Load failure, slow generation, or a runtime error — use the fallback voice.
    speakFallback(friendId, text);
    return { cancel: () => window.speechSynthesis?.cancel() };
  }
}

/** Stop any Kokoro/speech playback in flight. */
export function stopAllSpeaking() {
  window.speechSynthesis?.cancel();
}
