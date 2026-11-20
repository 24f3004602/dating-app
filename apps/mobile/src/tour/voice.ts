/**
 * The tour's voice (D136): the device's own text-to-speech through expo-speech: Android's
 * TextToSpeech in the phone app, the browser's speech synthesis in the web app. It only
 * ever says the tour's own words, never anything about the member, so nothing personal
 * reaches a speech engine, even one that works over the network (some browsers' voices do).
 */
import * as Speech from "expo-speech";
import { Platform } from "react-native";

/** What a voice list gives on every platform (the web adds `localService`). */
export type VoiceInfo = { identifier: string; language: string; quality?: string; localService?: boolean };

/**
 * Android's engine takes a bare language: given "en-IN" it falls back to the phone's own
 * language, so English there is "en" and the chosen voice brings India. Elsewhere "en-IN".
 */
export const SPEECH_LANGUAGE = Platform.OS === "android" ? "en" : "en-IN";

/** How long the voice list may take before the tour speaks with the engine's own English. */
export const VOICE_LIST_WAIT_MS = 1500;

/** The web app needs the browser's speech synthesis; the phone app always has an engine to ask. */
export function canSpeak(): boolean {
  if (Platform.OS !== "web") return true;
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

const languageOf = (v: VoiceInfo) => v.language.replace(/_/g, "-").toLowerCase();
/** On the device rather than on a server: the web says so; Android names network voices "...-network". */
const onDevice = (v: VoiceInfo) => v.localService ?? !/network/i.test(v.identifier);

/**
 * Indian English first, then any English; a voice on the device before one on a server,
 * an enhanced one before a plain one. No English voice: none, and the engine uses its own.
 */
export function pickVoice(voices: readonly VoiceInfo[]): string | undefined {
  let best: { id: string; score: number } | undefined;
  for (const v of voices) {
    const language = languageOf(v);
    if (language !== "en" && !language.startsWith("en-")) continue;
    const score = (language === "en-in" ? 4 : 0) + (onDevice(v) ? 2 : 0) + (v.quality === "Enhanced" ? 1 : 0);
    if (!best || score > best.score) best = { id: v.identifier, score };
  }
  return best?.id;
}

/**
 * One utterance per sentence: some browsers cut a long utterance off part-way, and a stop
 * then lands between sentences too. A sentence ends at ".", "!" or "?" before a space.
 */
export function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ((c === "." || c === "!" || c === "?") && (i + 1 === text.length || text[i + 1] === " ")) {
      const sentence = text.slice(start, i + 1).trim();
      if (sentence) out.push(sentence);
      start = i + 1;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

let chosen: string | undefined;
let loading: Promise<void> | null = null;
/** The chosen voice failed once: the engine's own English from then on. */
let plainVoice = false;
/** Each `say` and `hush` starts a new turn; anything an older turn reports is ignored. */
let turn = 0;

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/** Looks through the device's voices once, before the first word is needed. */
export function prepareVoice(): Promise<void> {
  if (!canSpeak()) return Promise.resolve();
  loading ??= within(Speech.getAvailableVoicesAsync(), VOICE_LIST_WAIT_MS).then((voices) => {
    chosen = pickVoice((voices ?? []) as VoiceInfo[]);
  });
  return loading;
}

export type SayEvents = { failed?: () => void };

/**
 * Says `text` from its start, stopping whatever was being said. On the web it all happens
 * inside the press that asked for it, as browsers want. If the engine reports an error,
 * the chosen voice is dropped and the words are tried once more with the engine's own
 * English; a second error calls `failed`.
 */
export function say(text: string, events: SayEvents = {}): void {
  if (!canSpeak()) {
    events.failed?.();
    return;
  }
  const mine = ++turn;
  const voice = plainVoice ? undefined : chosen;
  const parts = sentences(text);
  const speakAll = () => {
    for (const part of parts) {
      if (mine !== turn) return; // stopped, failed or replaced part-way
      Speech.speak(part, {
        language: SPEECH_LANGUAGE,
        ...(voice ? { voice } : {}),
        onError: () => {
          if (mine !== turn) return;
          turn++; // the rest of these sentences are dropped
          void Speech.stop();
          if (voice) {
            plainVoice = true;
            say(text, events);
          } else {
            events.failed?.();
          }
        },
      });
    }
  };
  if (Platform.OS === "web") {
    void Speech.stop(); // the browser's cancel happens at once
    speakAll();
  } else {
    // A phone's engine takes each call in its own time: speak once the stop has finished.
    Speech.stop().then(speakAll, speakAll);
  }
}

/** Stops speaking, and drops anything still to come from an earlier `say`. */
export function hush(): void {
  turn++;
  if (canSpeak()) void Speech.stop();
}

/** Tests only: forget the voice and its failures. */
export function resetVoice(): void {
  chosen = undefined;
  loading = null;
  plainVoice = false;
  turn = 0;
}
