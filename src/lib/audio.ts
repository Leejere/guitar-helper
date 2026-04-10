import * as Tone from 'tone';

let synth: Tone.PolySynth | null = null;
let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await Tone.start();
    initialized = true;
  }
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
}

/**
 * Play notes simultaneously.
 */
export async function playChord(notes: string[]) {
  await ensureInit();
  if (!synth || notes.length === 0) return;

  // Convert note names to frequency-compatible format
  const validNotes = notes.filter(n => {
    try {
      Tone.Frequency(n).toFrequency();
      return true;
    } catch {
      return false;
    }
  });

  if (validNotes.length === 0) return;

  synth.releaseAll();
  synth.triggerAttackRelease(validNotes, '1n');
}

/**
 * Play notes with a strum effect (slight delay between strings).
 */
export async function playStrum(notes: string[], downStrum = true) {
  await ensureInit();
  if (!synth || notes.length === 0) return;

  const validNotes = notes.filter(n => {
    try {
      Tone.Frequency(n).toFrequency();
      return true;
    } catch {
      return false;
    }
  });

  if (validNotes.length === 0) return;

  synth.releaseAll();

  const ordered = downStrum ? validNotes : [...validNotes].reverse();
  const now = Tone.now();

  ordered.forEach((note, i) => {
    synth!.triggerAttackRelease(note, '2n', now + i * 0.03);
  });
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
