import * as Tone from 'tone';

let synth: Tone.PolySynth | null = null;
let startPromise: Promise<void> | null = null;

function ensureStarted() {
  // Must be called synchronously inside a user-gesture handler
  // so mobile browsers allow the AudioContext to resume.
  if (!startPromise) {
    startPromise = Tone.start();
  }
  return startPromise;
}

function ensureSynth() {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.005,
        decay: 0.3,
        sustain: 0.2,
        release: 1.5,
      },
      volume: -8,
    });
    synth.maxPolyphony = 6;
    synth.toDestination();
  }
  return synth;
}

/**
 * Play notes simultaneously.
 */
export async function playChord(notes: string[]) {
  const ready = ensureStarted();
  const s = ensureSynth();
  if (notes.length === 0) return;

  const validNotes = notes.filter(n => {
    try {
      Tone.Frequency(n).toFrequency();
      return true;
    } catch {
      return false;
    }
  });

  if (validNotes.length === 0) return;

  await ready;
  s.releaseAll();
  s.triggerAttackRelease(validNotes, '1n');
}

/**
 * Play notes with a strum effect (slight delay between strings).
 */
export async function playStrum(notes: string[], downStrum = true) {
  const ready = ensureStarted();
  const s = ensureSynth();
  if (notes.length === 0) return;

  const validNotes = notes.filter(n => {
    try {
      Tone.Frequency(n).toFrequency();
      return true;
    } catch {
      return false;
    }
  });

  if (validNotes.length === 0) return;

  await ready;
  s.releaseAll();

  const ordered = downStrum ? validNotes : [...validNotes].reverse();
  const now = Tone.now();

  ordered.forEach((note, i) => {
    s.triggerAttackRelease(note, '2n', now + i * 0.03);
  });
}

/**
 * Play a single note with a short duration.
 */
export async function playNote(note: string) {
  const ready = ensureStarted();
  const s = ensureSynth();

  try {
    Tone.Frequency(note).toFrequency();
  } catch {
    return;
  }

  await ready;
  s.releaseAll();
  s.triggerAttackRelease(note, '8n');
}

/**
 * Dispose of the synth (cleanup).
 */
export function dispose() {
  if (synth) {
    synth.dispose();
    synth = null;
  }
}
