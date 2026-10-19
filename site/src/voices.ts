/** Per-friend speech settings for reading replies aloud. */

/** Kokoro TTS voice id + playback rate (pitch is shaped via preservesPitch=false + playbackRate). */
export type KokoroVoice = { voice: string; rate: number };

/** Legacy speechSynthesis settings, used as the fallback. */
export type VoiceSettings = { pitch: number; rate: number };

export type FriendVoice = {
  kokoro: KokoroVoice;
  fallback: VoiceSettings;
};

// None yet: the mascots speak in their own ElevenLabs voices, else in the browser's own voice.
export const VOICES: Record<string, FriendVoice> = {};

const SOUND_PREF_KEY = 'saath-talk-sound';

export function loadSoundPref(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSoundPref(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, on ? 'on' : 'off');
  } catch {
    // Private browsing — the toggle just won't be remembered.
  }
}

/** True when the browser's speech synthesis has at least one voice loaded. */
export function speechVoicesReady(): boolean {
  if (!('speechSynthesis' in window)) return false;
  return window.speechSynthesis.getVoices().length > 0;
}

/** Prefer an Indian English voice, then US English, then any English. */
export function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    voices.find((voice) => voice.lang === 'en-IN') ??
    voices.find((voice) => voice.lang.replace('_', '-') === 'en-US') ??
    voices.find((voice) => voice.lang.startsWith('en')) ??
    null
  );
}
