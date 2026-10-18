/** Per-friend speech settings for reading replies aloud. */
export type VoiceSettings = { pitch: number; rate: number };

export const VOICES: Record<string, VoiceSettings> = {
  doraemon: { pitch: 1.4, rate: 1.0 },
  nobita: { pitch: 1.2, rate: 0.95 },
  shinchan: { pitch: 1.8, rate: 1.15 },
  goku: { pitch: 0.9, rate: 1.05 },
};

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
