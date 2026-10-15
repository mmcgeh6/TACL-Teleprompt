import { useCallback, useEffect, useRef, useState } from 'react';

/* ---------------- Word matching ---------------- */

export function normalizeWord(w: string) {
  return w
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function similar(a: string, b: string) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  // Plurals, tenses, and recognizer slips: shared stem or one edit apart
  if (a.startsWith(b) || b.startsWith(a)) return Math.abs(a.length - b.length) <= 3;
  return editDistanceAtMostOne(a, b);
}

function editDistanceAtMostOne(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Longest common subsequence length, using fuzzy word equality. */
function lcs(a: string[], b: string[]) {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = similar(a[i - 1], b[j - 1]) ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

const TAIL = 8; // spoken words considered per update
const LOOKAHEAD = 40; // how far ahead of the current spot to search

/**
 * Finds where the speaker is in the script.
 * `script` holds the normalized words; `pos` is the last word already read (-1 at the start).
 * Returns the new position, never moving backwards.
 */
export function locate(script: string[], spokenText: string, pos: number): number {
  const spoken = spokenText.split(/\s+/).map(normalizeWord).filter(Boolean);
  if (!spoken.length) return pos;
  const tail = spoken.slice(-TAIL);
  const last = tail[tail.length - 1];
  const before = tail.slice(0, -1);

  let best = pos;
  let bestScore = 0;
  let bestDist = Infinity;

  const start = Math.max(0, pos - 2);
  const end = Math.min(script.length - 1, pos + LOOKAHEAD);
  for (let j = start; j <= end; j++) {
    if (!similar(last, script[j])) continue;
    const window = script.slice(Math.max(0, j - TAIL * 2), j).filter(Boolean);
    const score = 1 + lcs(before, window);
    const jump = j - pos;

    // Single-word matches only count right next to where we are; bigger jumps need three agreeing words
    const needed = jump <= 3 ? Math.min(2, tail.length) : 3;
    if (score < needed) continue;

    const dist = Math.abs(jump);
    if (score > bestScore || (score === bestScore && dist < bestDist)) {
      best = j;
      bestScore = score;
      bestDist = dist;
    }
  }
  return Math.max(pos, best);
}

/* ---------------- Speech recognition ---------------- */

// The Web Speech API is not in TypeScript's DOM lib yet
/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const speechSupported = getRecognitionCtor() !== null;

export type SpeechStatus = 'idle' | 'listening' | 'error';

/**
 * Continuous speech recognition that restarts itself when the browser ends a session
 * (mobile browsers stop after a pause in speech).
 */
export function useSpeech(lang: string, onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const wantRef = useRef(false);
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  const stop = useCallback(() => {
    wantRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
    setStatus('idle');
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus('error');
      setError('Voice follow is not supported in this browser. Try Chrome or Safari.');
      return;
    }
    wantRef.current = true;
    setError(null);

    const launch = () => {
      if (!wantRef.current) return;
      const rec: Recognition = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += ' ' + e.results[i][0].transcript;
        cbRef.current(text);
      };
      rec.onerror = (e: any) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          wantRef.current = false;
          setStatus('error');
          setError('Microphone access was blocked. Allow the microphone for this site, then try again.');
        } else if (e.error === 'audio-capture') {
          wantRef.current = false;
          setStatus('error');
          setError('No microphone was found.');
        }
        // 'no-speech' and 'aborted' are routine; onend restarts the session
      };
      rec.onend = () => {
        if (wantRef.current) setTimeout(launch, 150);
        else setStatus('idle');
      };
      recRef.current = rec;
      try {
        rec.start();
        setStatus('listening');
      } catch {
        setTimeout(launch, 300);
      }
    };
    launch();
  }, [lang]);

  useEffect(() => stop, [stop]);

  return { status, error, start, stop };
}
