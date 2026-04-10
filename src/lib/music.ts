import { Note, Interval, Chord } from 'tonal';
import { detectBarres, type Voicing, type Barre } from './voicings';

export interface ChordCandidate {
  name: string;         // chord symbol e.g. "Am7"
  frets: number[];      // length=6, -1=muted, 0=open, 1+=fretted
  exact: boolean;       // true = all user-selected notes used; false = partial/vague match
}

/**
 * Identify chords from user-selected fret positions.
 * Unspecified strings are tried as both open and muted.
 * Also finds vague matches by dropping one selected note at a time.
 */
export function identifyChords(
  selectedPositions: { string: number; fret: number }[],
  tuning: string[],
  stringCount: number = 6
): ChordCandidate[] {
  if (selectedPositions.length < 2) return [];

  // Build the base frets array: NaN for unspecified strings
  const baseFrets: (number | typeof NaN)[] = new Array(stringCount).fill(NaN);
  for (const p of selectedPositions) {
    baseFrets[p.string] = p.fret;
  }

  // Indices of unspecified strings
  const unknownStrings: number[] = [];
  for (let s = 0; s < stringCount; s++) {
    if (Number.isNaN(baseFrets[s])) unknownStrings.push(s);
  }

  // Generate all open/muted combinations for unknown strings
  function* generateCombos(): Generator<number[]> {
    const total = 1 << unknownStrings.length; // 2^n combinations
    for (let mask = 0; mask < total; mask++) {
      const frets = baseFrets.map(f => (Number.isNaN(f) ? -1 : f)) as number[];
      for (let i = 0; i < unknownStrings.length; i++) {
        if (mask & (1 << i)) {
          frets[unknownStrings[i]] = 0; // open
        }
        // else stays -1 (muted)
      }
      yield frets;
    }
  }

  function getNotesFromFrets(frets: number[]): string[] {
    const notes: string[] = [];
    for (let s = 0; s < frets.length; s++) {
      if (frets[s] >= 0) {
        notes.push(Note.transpose(tuning[s], Interval.fromSemitones(frets[s])));
      }
    }
    return notes;
  }

  // Collect exact matches (all user-selected notes present)
  const seen = new Set<string>();
  const results: ChordCandidate[] = [];

  for (const frets of generateCombos()) {
    const notes = getNotesFromFrets(frets);
    if (notes.length < 2) continue;
    const pcs = notes.map(n => Note.pitchClass(n));
    const detected = Chord.detect(pcs).map(formatChordName);
    for (const name of detected) {
      const key = `${name}|${frets.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!seen.has(`name:${name}`)) {
        seen.add(`name:${name}`);
        results.push({ name, frets: [...frets], exact: true });
      }
    }
  }

  // Vague matches: drop each selected position one at a time
  if (selectedPositions.length >= 3) {
    for (let drop = 0; drop < selectedPositions.length; drop++) {
      const reduced = selectedPositions.filter((_, i) => i !== drop);
      const reducedFrets = new Array(stringCount).fill(NaN);
      for (const p of reduced) reducedFrets[p.string] = p.fret;

      // For the dropped string, try muted only
      const unknowns: number[] = [];
      for (let s = 0; s < stringCount; s++) {
        if (Number.isNaN(reducedFrets[s])) unknowns.push(s);
      }

      const total = 1 << unknowns.length;
      // Limit combos for vague matching to avoid explosion
      const limit = Math.min(total, 64);
      for (let mask = 0; mask < limit; mask++) {
        const frets = reducedFrets.map((f: number) => (Number.isNaN(f) ? -1 : f)) as number[];
        for (let i = 0; i < unknowns.length; i++) {
          if (mask & (1 << i)) frets[unknowns[i]] = 0;
        }
        const notes = getNotesFromFrets(frets);
        if (notes.length < 2) continue;
        const pcs = notes.map(n => Note.pitchClass(n));
        const detected = Chord.detect(pcs).map(formatChordName);
        for (const name of detected) {
          if (seen.has(`name:${name}`)) continue;
          seen.add(`name:${name}`);
          // Build display frets using user's original positions + mute the dropped string
          const displayFrets = baseFrets.map(f => (Number.isNaN(f) ? -1 : f)) as number[];
          displayFrets[selectedPositions[drop].string] = -1;
          // Fill unknowns from the combo that matched
          for (let i = 0; i < unknowns.length; i++) {
            displayFrets[unknowns[i]] = frets[unknowns[i]];
          }
          results.push({ name, frets: displayFrets, exact: false });
        }
      }
    }
  }

  return results;
}

/** Build a Voicing object from a frets array for display in ChordDiagram. */
export function fretsToVoicing(frets: number[], tuning: string[]): Voicing {
  const frettedFrets = frets.filter(f => f > 0);
  const bassFret = frettedFrets.length > 0 ? Math.min(...frettedFrets) : 0;
  const notes: string[] = [];
  const pitchClasses: string[] = [];
  for (let s = 0; s < frets.length; s++) {
    if (frets[s] >= 0) {
      const note = Note.transpose(tuning[s], Interval.fromSemitones(frets[s]));
      notes.push(note);
      pitchClasses.push(Note.pitchClass(note));
    }
  }
  const barres = detectBarres(frets);
  return { frets, barres, bassFret, notes, pitchClasses, rank: 0, positionGroup: '' };
}

/**
 * Replace ASCII sharp/flat with proper musical symbols for display.
 * "C#" → "C♯", "Bb" → "B♭", "b3" → "♭3", "#4" → "♯4"
 */
export function displayAccidental(s: string): string {
  // Note names: letter followed by # or b (e.g. C#, Db, F#m, Bbmaj7)
  // Double accidentals: ## → 𝄪 (double sharp), bb → 𝄫 (double flat)
  // Interval labels: # or b at start or after non-letter (e.g. b3, #4, b7)
  return s
    .replace(/([A-Ga-g])##/g, '$1𝄪')
    .replace(/([A-Ga-g])bb/g, '$1𝄫')
    .replace(/([A-Ga-g])#/g, '$1♯')
    .replace(/([A-Ga-g])b/g, '$1♭')
    .replace(/(^|[^A-Za-z♯♭])b(\d)/g, '$1♭$2')
    .replace(/(^|[^A-Za-z♯♭])#(\d)/g, '$1♯$2');
}

/**
 * Normalize user input: replace ♯→# and ♭→b so tonal can parse it.
 */
export function normalizeInput(s: string): string {
  return s.replace(/♯/g, '#').replace(/♭/g, 'b');
}

export interface FretNote {
  string: number; // 0 = lowest (6th string), 5 = highest (1st string)
  fret: number;
  note: string; // e.g. "C4"
  pitchClass: string; // e.g. "C"
  midi: number;
}

/**
 * Get the note at a specific string+fret position.
 */
export function fretToNote(openString: string, fret: number): FretNote & { openString: string } {
  const note = Note.transpose(openString, Interval.fromSemitones(fret));
  return {
    string: 0,
    fret,
    note,
    pitchClass: Note.pitchClass(note),
    midi: Note.midi(note) ?? 0,
    openString,
  };
}

/**
 * Get all notes on the fretboard for a given tuning.
 */
export function getAllFretboardNotes(tuningNotes: string[], fretCount: number): FretNote[] {
  const notes: FretNote[] = [];
  for (let s = 0; s < tuningNotes.length; s++) {
    for (let f = 0; f <= fretCount; f++) {
      const info = fretToNote(tuningNotes[s], f);
      notes.push({
        string: s,
        fret: f,
        note: info.note,
        pitchClass: info.pitchClass,
        midi: info.midi,
      });
    }
  }
  return notes;
}

/**
 * Compute the interval from root to a given note.
 * Returns short label like "1P", "3M", "5P", "b7", etc.
 */
export function getIntervalLabel(root: string, note: string): string {
  const interval = Interval.distance(root, Note.pitchClass(note));
  return simplifyIntervalLabel(interval);
}

function simplifyIntervalLabel(interval: string): string {
  const map: Record<string, string> = {
    '1P': 'R',
    '2m': 'b2',
    '2M': '2',
    '2A': '#2',
    '3m': 'b3',
    '3M': '3',
    '4P': '4',
    '4A': '#4',
    '5d': 'b5',
    '5P': '5',
    '5A': '#5',
    '6m': 'b6',
    '6M': '6',
    '7m': 'b7',
    '7M': '7',
  };
  return map[interval] ?? interval;
}

/**
 * Detect chords from a set of note names.
 */
export function detectChords(notes: string[]): string[] {
  if (notes.length < 2) return [];
  const pitchClasses = notes.map(n => Note.pitchClass(n));
  return Chord.detect(pitchClasses).map(formatChordName);
}

/**
 * Format chord name: use "C" instead of "CM" for major, etc.
 */
export function formatChordName(name: string): string {
  // Replace standalone "M" (major) but keep "M7", "Maj", "Mm", etc.
  return name.replace(/M(?!aj|7|6|9|11|13|m)/g, '');
}

/**
 * Get chord info by name.
 */
export function getChord(name: string) {
  return Chord.get(name);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export { NOTE_NAMES, FLAT_NAMES };

/**
 * All 12 root note options for key selection.
 */
export const ALL_ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

/**
 * Normalize enharmonic: given a note, return normalised pitch class.
 */
export function normalizePitchClass(note: string): string {
  return Note.pitchClass(note);
}

/**
 * Convert MIDI note number to note name with octave.
 */
export function midiToNote(midi: number): string {
  return Note.fromMidi(midi);
}
