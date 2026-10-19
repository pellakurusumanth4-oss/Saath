/** Minimal typings for the webkit-prefixed SpeechRecognition API. */
type SpeechRecognitionAlternativeLike = { transcript: string };

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
};

type SpeechRecognitionErrorEventLike = { error: string };

export type RecognitionHandle = { stop: () => void };

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionWindow = Window & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

// Errors when the API is there but no speech service is behind it (in-app and Electron browsers, Chromium builds).
const NO_SERVICE = ['network', 'service-not-allowed', 'language-not-supported'];
// Brave has the API but fails at once; any browser that fails that way stays on typing for the rest of the page.
let noService = 'brave' in navigator;

/** Whether this browser can turn speech into words (Chrome, Edge, Safari); false once it has failed for lack of a service. */
export function speechSupported(): boolean {
  const win = window as RecognitionWindow;
  return !noService && Boolean(win.SpeechRecognition ?? win.webkitSpeechRecognition);
}

/** Start one listen phrase. Calls back with interim and final text; resolves the handle so callers can cancel. */
export function listenOnce(handlers: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
}): RecognitionHandle | null {
  const win = window as RecognitionWindow;
  const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  if (!Ctor || noService) return null;
  const recognition = new Ctor();
  recognition.lang = 'en-IN';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  let done = false;
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        done = true;
        handlers.onFinal(result[0].transcript);
        return;
      }
      interim += result[0].transcript;
    }
    if (interim) handlers.onPartial(interim);
  };
  recognition.onerror = (event) => {
    if (NO_SERVICE.includes(event?.error)) noService = true;
    if (!done) {
      done = true;
      handlers.onError(event?.error ?? 'unknown');
    }
  };
  recognition.onend = () => {
    if (!done) {
      done = true;
      handlers.onError('no-speech');
    }
  };
  recognition.start();
  return { stop: () => recognition.stop() };
}
