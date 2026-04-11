import { Note, Interval } from 'tonal';

export type CAGEDShape = 'C' | 'A' | 'G' | 'E' | 'D' | 'Dim';

/**
 * Build a chroma → pitch class map to respell notes consistently with a chord's context.
 * Uses the chord's own note spellings; falls back to flat/sharp preference from the root.
 */
function buildRespellMap(chordNotes: string[]): Map<number, string> {
  const map = new Map<number, string>();
  // Map chord tones by their chroma
  for (const n of chordNotes) {
    const c = Note.chroma(n);
    if (c !== undefined) map.set(c, Note.pitchClass(n));
  }
  // For non-chord chromas, prefer flats if root uses flat, sharps otherwise
  const usesFlats = chordNotes[0]?.includes('b') ?? false;
  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const names = usesFlats ? FLAT_NAMES : SHARP_NAMES;
  for (let c = 0; c < 12; c++) {
    if (!map.has(c)) map.set(c, names[c]);
  }
  return map;
}

/** Respell a note (with octave) to match a chord's enharmonic context. */
export function respellNote(note: string, respellMap: Map<number, string>): string {
  const chroma = Note.chroma(note);
  if (chroma === undefined) return note;
  const preferred = respellMap.get(chroma);
  if (!preferred) return note;
  const midi = Note.midi(note);
  if (midi === null) return preferred;
  // Compute octave: MIDI 60 = C4
  const octave = Math.floor((midi - Note.chroma(preferred)!) / 12) + (Note.chroma(preferred)! <= chroma ? 0 : 0);
  // Use tonal's built-in octave calculation for correctness
  const origOctave = Note.octave(note);
  if (origOctave === undefined) return preferred;
  // Adjust octave if respelling crosses B/C boundary
  const origChroma = Note.chroma(Note.pitchClass(note))!;
  let newOctave = origOctave;
  if (origChroma < 3 && Note.chroma(preferred)! >= 9) newOctave--; // e.g. C -> B# (prev octave)
  if (origChroma >= 9 && Note.chroma(preferred)! < 3) newOctave++; // e.g. B# -> C (next octave)
  return preferred + newOctave;
}

export interface CAGEDInfo {
  shape: CAGEDShape;
  /** Closest chord quality matched: 'major', 'minor', '7', 'm7', 'maj7', 'sus2', 'sus4' */
  quality: string;
  /** The fret the shape is rooted at (0 = open position) */
  position: number;
  /** Human-readable label, e.g. "E shape", "Am shape", "D7 shape", "Am7 shape var." */
  label: string;
}

export interface Voicing {
  frets: number[]; // length = 6, -1 = muted, 0 = open, 1+ = fretted
  barres: Barre[];
  bassFret: number; // lowest fret for display offset (excluding open)
  notes: string[]; // sounding note names (with octave)
  pitchClasses: string[];
  fingering?: number[];
  caged?: CAGEDInfo;
  rank: number; // playability rank (1 = most playable)
  positionGroup: string; // e.g. "Open position", "Fret 3"
}

export interface Barre {
  fret: number;
  fromString: number; // lowest string index (0-based, 0=low E)
  toString: number; // highest string index
}

interface VoicingSearchOptions {
  tuning: string[];
  maxFret?: number;
  maxSpan?: number;
  maxResults?: number;
  requireRoot?: boolean;
  /** For slash chords: pitch class that must be the lowest sounding note */
  requiredBass?: string;
}

/**
 * Determine which chord tones may be omitted based on chord size and interval type.
 *
 * Standard guitar voicing practice:
 *  - Perfect 5th (7 semitones above root): omittable in 4+ note chords.
 *    It's harmonically redundant (strong in the overtone series).
 *    Diminished 5th (6) and augmented 5th (8) are characteristic — never omit.
 *  - 9th (1 or 2 semitones above root): omittable in 6+ note chords (11ths, 13ths).
 *  - 11th (5 or 6 semitones above root): omittable in 7-note chords (13ths).
 *    In dominant 13 chords the natural 11th also clashes with the major 3rd.
 */
function getOmittableNotes(chordSemitones: Set<number>, rootSemitone: number | undefined): Set<number> {
  const omittable = new Set<number>();
  if (rootSemitone === undefined) return omittable;
  const size = chordSemitones.size;

  // Perfect 5th — omittable for 4+ note chords
  if (size >= 4) {
    const p5 = (rootSemitone + 7) % 12;
    if (chordSemitones.has(p5)) omittable.add(p5);
  }

  // 9th — omittable for 6+ note chords (11ths, 13ths)
  if (size >= 6) {
    for (const offset of [1, 2]) { // minor 9th, major 9th
      const n = (rootSemitone + offset) % 12;
      if (chordSemitones.has(n)) omittable.add(n);
    }
  }

  // 11th — omittable for 7-note chords (13ths)
  if (size >= 7) {
    for (const offset of [5, 6]) { // perfect 11th, sharp 11th
      const n = (rootSemitone + offset) % 12;
      if (chordSemitones.has(n)) omittable.add(n);
    }
  }

  return omittable;
}

/**
 * Find all playable voicings of a chord on guitar.
 * Uses constraint-based depth-first search with aggressive pruning.
 */
export function findVoicings(
  chordNotes: string[], // pitch classes e.g. ["C", "E", "G"]
  options: VoicingSearchOptions
): Voicing[] {
  const {
    tuning,
    maxFret = 15,
    maxSpan = 4,
    maxResults = 20,
    requiredBass,
  } = options;

  if (chordNotes.length === 0) return [];

  const requiredBassChroma = requiredBass !== undefined ? Note.chroma(requiredBass) : undefined;

  // Normalize chord notes to semitone values for fast comparison
  const chordSemitones = new Set(
    chordNotes.map(n => Note.chroma(n)).filter((c): c is number => c !== undefined)
  );
  // For slash chords, ensure the bass note is in the chord tone set
  if (requiredBassChroma !== undefined) {
    chordSemitones.add(requiredBassChroma);
  }
  const rootSemitone = Note.chroma(chordNotes[0]);

  // Build respell map for consistent enharmonic naming
  const respellMap = buildRespellMap(chordNotes);

  // Determine which chord tones can be omitted (standard guitar voicing practice).
  // The resulting "required" set must always be present; omittable tones are scored bonuses.
  const omittable = getOmittableNotes(chordSemitones, rootSemitone);
  const requiredSemitones = new Set([...chordSemitones].filter(s => !omittable.has(s)));

  // Build candidates per string: list of frets whose pitch class is in the chord
  const candidates: number[][] = [];
  for (let s = 0; s < tuning.length; s++) {
    const openMidi = Note.midi(tuning[s]);
    if (openMidi === null) continue;
    const stringCandidates: number[] = [-1]; // muted is always an option
    for (let f = 0; f <= maxFret; f++) {
      const chroma = (Note.chroma(tuning[s])! + f) % 12;
      if (chordSemitones.has(chroma)) {
        stringCandidates.push(f);
      }
    }
    candidates.push(stringCandidates);
  }

  const results: Voicing[] = [];

  // DFS with pruning
  function search(stringIdx: number, current: number[], minFret: number, maxFretUsed: number, coveredSemitones: Set<number>, fingerCount: number, hasOpen: boolean) {
    if (stringIdx === tuning.length) {
      // All required chord tones must be present; omittable ones are optional
      for (const req of requiredSemitones) {
        if (!coveredSemitones.has(req)) return;
      }

      // Check no inner mutes: once we start playing, mutes can only be on the edges
      let firstPlayed = -1;
      let lastPlayed = -1;
      for (let i = 0; i < current.length; i++) {
        if (current[i] !== -1) {
          if (firstPlayed === -1) firstPlayed = i;
          lastPlayed = i;
        }
      }
      if (firstPlayed === -1) return; // all muted

      for (let i = firstPlayed; i <= lastPlayed; i++) {
        if (current[i] === -1) return; // inner mute
      }

      // For slash chords: lowest sounding note must match the required bass
      if (requiredBassChroma !== undefined) {
        const bassChroma = (Note.chroma(tuning[firstPlayed])! + current[firstPlayed]) % 12;
        if (bassChroma !== requiredBassChroma) return;
      }

      // Build voicing
      const frets = [...current];
      const frettedFrets = frets.filter(f => f > 0);
      const bassFret = frettedFrets.length > 0 ? Math.min(...frettedFrets) : 0;

      const notes: string[] = [];
      const pitchClasses: string[] = [];
      for (let s = 0; s < tuning.length; s++) {
        if (frets[s] !== -1) {
          const rawNote = Note.transpose(tuning[s], Interval.fromSemitones(frets[s]));
          const note = respellNote(rawNote, respellMap);
          notes.push(note);
          pitchClasses.push(Note.pitchClass(note));
        }
      }

      const barres = detectBarres(frets);

      results.push({ frets, barres, bassFret, notes, pitchClasses, rank: 0, positionGroup: '' });
      return;
    }

    for (const fret of candidates[stringIdx]) {
      if (fret === -1) {
        // Muted string
        search(stringIdx + 1, [...current, -1], minFret, maxFretUsed, new Set(coveredSemitones), fingerCount, hasOpen);
        continue;
      }

      const newHasOpen = hasOpen || fret === 0;
      const newMin = fret === 0 ? minFret : (minFret === 0 ? fret : Math.min(minFret, fret));
      const newMax = fret === 0 ? maxFretUsed : Math.max(maxFretUsed, fret);

      // Span check (only for fretted, non-open strings)
      if (newMin > 0 && newMax > 0 && newMax - newMin >= maxSpan) continue;

      // Prune: open strings mixed with frets > 4 are unplayable
      if (newHasOpen && newMax > 4) continue;
      if (fret === 0 && maxFretUsed > 4) continue;

      // Finger count check (open strings and barres are free)
      const newFingerCount = fret === 0 ? fingerCount : fingerCount + 1;
      // Allow up to 6 fretted notes — barres reduce effective fingers later
      if (newFingerCount > 6) continue;

      const chroma = (Note.chroma(tuning[stringIdx])! + fret) % 12;
      const newCovered = new Set(coveredSemitones);
      newCovered.add(chroma);

      search(stringIdx + 1, [...current, fret], newMin, newMax, newCovered, newFingerCount, newHasOpen);
    }
  }

  search(0, [], 0, 0, new Set(), 0, false);

  // Filter out physically impossible voicings (more than 4 effective fingers)
  let playable = results.filter(v => effectiveFingerCount(v) <= 4);

  // For non-slash chords: eliminate voicings whose bass note isn't the root
  if (requiredBassChroma === undefined && rootSemitone !== undefined) {
    playable = playable.filter(v => {
      const first = v.frets.findIndex(f => f !== -1);
      if (first === -1) return false;
      const bassChroma = (Note.chroma(tuning[first])! + v.frets[first]) % 12;
      return bassChroma === rootSemitone;
    });
  }

  // Require at least 3 voiced strings
  playable = playable.filter(v => v.frets.filter(f => f !== -1).length >= 3);

  // Require at least one bass string voiced (strings 4-6 = indices 0-2)
  playable = playable.filter(v =>
    v.frets[0] !== -1 || v.frets[1] !== -1 || v.frets[2] !== -1
  );

  // Require at least one treble string voiced (strings 1-3 = indices 3-5)
  playable = playable.filter(v =>
    v.frets[3] !== -1 || v.frets[4] !== -1 || v.frets[5] !== -1
  );

  // Eliminate voicings with muted upper strings (indices 3-5) when a better
  // voicing exists that matches on all voiced strings and voices more upper strings.
  playable = filterRedundantUpperMutes(playable);

  // Rank voicings
  const ranked = rankVoicings(playable, rootSemitone, tuning, chordSemitones, requiredBassChroma);
  const top = ranked.slice(0, maxResults);

  // Classify each voicing by CAGED shape and position group
  const rootPC = chordNotes[0];
  for (const v of top) {
    v.caged = classifyCAGED(v, rootPC, tuning);
    // Position group: open vs fret N
    const fretted = v.frets.filter(f => f > 0);
    const hasOpen = v.frets.some(f => f === 0);
    if (fretted.length === 0 || hasOpen) {
      v.positionGroup = 'Open position';
    } else {
      v.positionGroup = `Fret ${Math.min(...fretted)}`;
    }
  }

  // Assign ranks (already sorted by playability descending from rankVoicings)
  for (let i = 0; i < top.length; i++) {
    top[i].rank = i + 1;
  }

  return top;
}

function effectiveFingerCount(v: Voicing): number {
  let fingers = v.frets.filter(f => f > 0).length;
  for (const barre of v.barres) {
    const covered = v.frets.filter((f, s) =>
      s >= barre.fromString && s <= barre.toString && f === barre.fret
    ).length;
    fingers -= (covered - 1);
  }
  return fingers;
}

export function detectBarres(frets: number[]): Barre[] {
  const barres: Barre[] = [];
  const frettedFrets = frets.filter(f => f > 0);
  if (frettedFrets.length < 2) return barres;

  // Find the lowest sounding string (not muted)
  let lowestSounding = -1;
  for (let s = 0; s < frets.length; s++) {
    if (frets[s] >= 0) { lowestSounding = s; break; }
  }
  if (lowestSounding < 0) return barres;

  // Find all frets that appear on 2+ strings — each is a barre candidate
  const fretCounts = new Map<number, number[]>();
  for (let s = 0; s < frets.length; s++) {
    if (frets[s] > 0) {
      if (!fretCounts.has(frets[s])) fretCounts.set(frets[s], []);
      fretCounts.get(frets[s])!.push(s);
    }
  }

  const minFret = Math.min(...frettedFrets);
  const maxFret = Math.max(...frettedFrets);

  for (const [fret, strings] of fretCounts) {
    if (strings.length < 2) continue;
    // Only consider barres at min fret (index finger) or max fret (ring/pinky lay-flat)
    if (fret !== minFret && fret !== maxFret) continue;
    // For max-fret barre (not at min), require 3+ strings to be meaningful
    if (fret !== minFret && strings.length < 3) continue;

    const from = Math.min(...strings);
    const to = Math.max(...strings);

    // A barre requires the finger to lay flat across strings.
    // This is only possible if there are no open strings (fret 0)
    // between the lowest sounding string and the barre's end.
    // If any string from lowestSounding..to is open, the barre is impossible
    // because the finger can't skip over open strings.
    let hasOpenBelow = false;
    for (let s = lowestSounding; s <= to; s++) {
      if (frets[s] === 0) {
        hasOpenBelow = true;
        break;
      }
    }
    if (hasOpenBelow) continue;

    // Verify all strings between from..to are fretted at >= this fret
    // (muted strings break the barre)
    let validBarre = true;
    for (let s = from; s <= to; s++) {
      if (frets[s] < fret) {
        validBarre = false;
        break;
      }
    }
    if (!validBarre) continue;

    // A barre finger extends from the treble side (high E, index 5) toward
    // the bass side. Any sounding string on the treble side of the barre
    // (index > to) would also be pressed at this fret, so it must not be
    // fretted lower than the barre fret — otherwise the barre is impossible.
    for (let s = to + 1; s < frets.length; s++) {
      if (frets[s] >= 0 && frets[s] < fret) {
        validBarre = false;
        break;
      }
    }

    if (validBarre) {
      barres.push({ fret, fromString: from, toString: to });
    }
  }

  return barres;
}

/**
 * Remove voicings with muted upper strings (G, B, high E = indices 3-5)
 * when another voicing in the pool "dominates" it: matches on every voiced
 * string and additionally voices at least one of the muted upper strings.
 *
 * Example: C x320xx is dominated by x32010 (same bass strings, voices B and E).
 */
function filterRedundantUpperMutes(voicings: Voicing[]): Voicing[] {
  return voicings.filter(v => {
    // Find muted upper strings (indices 3, 4, 5)
    const mutedUppers: number[] = [];
    for (let s = 3; s < v.frets.length; s++) {
      if (v.frets[s] === -1) mutedUppers.push(s);
    }
    if (mutedUppers.length === 0) return true; // no muted upper strings, keep

    // Check if any other voicing dominates this one
    for (const other of voicings) {
      if (other === v) continue;

      // other must match v on every string where v is voiced
      let matches = true;
      for (let s = 0; s < v.frets.length; s++) {
        if (v.frets[s] !== -1 && other.frets[s] !== v.frets[s]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // other must voice at least one of v's muted upper strings
      const voicesMore = mutedUppers.some(s => other.frets[s] !== -1);
      if (voicesMore) return false; // dominated — eliminate
    }

    return true; // not dominated, keep
  });
}

function rankVoicings(voicings: Voicing[], rootSemitone: number | undefined, tuning: string[], chordSemitones: Set<number>, requiredBassChroma: number | undefined): Voicing[] {
  const scores = new Map<Voicing, number>();
  for (const v of voicings) {
    scores.set(v, scoreVoicing(v, rootSemitone, tuning, chordSemitones, requiredBassChroma));
  }
  return [...voicings].sort((a, b) => scores.get(b)! - scores.get(a)!);
}

function scoreVoicing(v: Voicing, rootSemitone: number | undefined, tuning: string[], chordSemitones: Set<number>, requiredBassChroma: number | undefined): number {
  let score = 0;
  const frettedFrets = v.frets.filter(f => f > 0);
  const openCount = v.frets.filter(f => f === 0).length;
  const mutedCount = v.frets.filter(f => f === -1).length;
  const soundingCount = v.frets.filter(f => f !== -1).length;
  const maxFretted = frettedFrets.length > 0 ? Math.max(...frettedFrets) : 0;
  const minFretted = frettedFrets.length > 0 ? Math.min(...frettedFrets) : 0;

  // === CRITICAL: Penalize mixing open strings with high-fret positions ===
  if (openCount > 0 && maxFretted > 4) {
    score -= 100;
  }

  // Two-tier sandwiched open string penalty:
  // 1) Mild base penalty for ANY open string between first and last fretted string
  //    (disrupts hand position, prevents clean barre shapes)
  // 2) Harsh extra penalty when BOTH neighboring strings are fretted (> 0)
  //    (forces awkward finger arching — the real playability issue)
  if (openCount > 0 && frettedFrets.length > 0) {
    const firstFrettedIdx = v.frets.findIndex(f => f > 0);
    const lastFrettedIdx = v.frets.length - 1 - [...v.frets].reverse().findIndex(f => f > 0);
    let generalSandwiched = 0;
    let adjSameFret = 0;   // both neighbors at same fret — blocks natural barre
    let adjDiffFret = 0;   // neighbors at different frets — separate fingers anyway
    for (let s = firstFrettedIdx; s <= lastFrettedIdx; s++) {
      if (v.frets[s] === 0) {
        generalSandwiched++;
        if (s > 0 && s < v.frets.length - 1 && v.frets[s - 1] > 0 && v.frets[s + 1] > 0) {
          if (v.frets[s - 1] === v.frets[s + 1]) {
            adjSameFret++;
          } else {
            adjDiffFret++;
          }
        }
      }
    }
    // Base: mild penalty for any sandwiched open
    score -= generalSandwiched * 3;
    // Harsh penalty when both neighbors are at same fret (blocks barre, forces arching)
    if (adjSameFret > 0) {
      const fretSpan = maxFretted - minFretted;
      let extraPenalty: number;
      if (minFretted >= 3) {
        extraPenalty = 12;  // high position
      } else if (fretSpan >= 2) {
        extraPenalty = 9;   // wide span
      } else {
        extraPenalty = 2;   // narrow span in open position
      }
      score -= adjSameFret * extraPenalty;
    }
    // Mild penalty when neighbors are at different frets (separate fingers anyway)
    score -= adjDiffFret * 1;
  }

  // Prefer root as bass note (skip for slash chords — bass is already enforced)
  if (requiredBassChroma === undefined && rootSemitone !== undefined) {
    const firstSounding = v.frets.findIndex(f => f !== -1);
    if (firstSounding !== -1) {
      const bassChroma = (Note.chroma(tuning[firstSounding])! + v.frets[firstSounding]) % 12;
      if (bassChroma === rootSemitone) {
        score += 40;
      } else {
        score -= 15;
      }
    }
  }

  // Strongly prefer open-position voicings (all fretted notes <= 3)
  if (frettedFrets.length > 0 && maxFretted <= 3) {
    score += 20;
  } else if (frettedFrets.length > 0 && maxFretted <= 5) {
    score += 10;
  }

  // Small bonus for open strings (already gated by the open+high penalty)
  score += openCount * 2;

  // Prefer lower position
  if (frettedFrets.length > 0) {
    const avgPos = frettedFrets.reduce((a, b) => a + b, 0) / frettedFrets.length;
    score -= avgPos * 4;
  }

  // Penalize muted strings — treble mutes are worse than bass mutes
  for (let s = 0; s < v.frets.length; s++) {
    if (v.frets[s] === -1) {
      // String 0 (low E) = least penalty, string 5 (high E) = most penalty
      score -= 5 + s * 2;
    }
  }

  // Prefer more strings sounding
  score += soundingCount * 3;

  // Prefer smaller fret span (easier fingering)
  if (frettedFrets.length > 1) {
    const span = maxFretted - minFretted;
    score -= span * 4;
  }

  // Reward barre chord shapes — they're a single natural hand position
  let fingerCount = frettedFrets.length;
  if (v.barres.length > 0) {
    for (const barre of v.barres) {
      const coveredByBarre = v.frets.filter((f, s) =>
        s >= barre.fromString && s <= barre.toString && f === barre.fret
      ).length;
      fingerCount -= (coveredByBarre - 1);
    }
    score += 10;
  }
  // Prefer fewer fingers needed
  score -= Math.max(0, fingerCount - 3) * 4;

  // Penalize incomplete voicings (e.g. omitted 5th)
  const soundingSemitones = new Set(
    v.frets.map((f, s) => f >= 0 ? (Note.chroma(tuning[s])! + f) % 12 : -1).filter(c => c >= 0)
  );
  const missingCount = [...chordSemitones].filter(s => !soundingSemitones.has(s)).length;
  score -= missingCount * 3;

  // Penalize if the lowest sounding note isn't on a low string
  // (voicings starting from string 3+ sound thin)
  const firstSounding = v.frets.findIndex(f => f !== -1);
  if (firstSounding >= 3) {
    score -= 15;
  } else if (firstSounding >= 2) {
    score -= 5;
  }

  // Reduce sandwiched penalty for "thumb-wrap" bass patterns:
  // When string 0 is fretted low (1-3) and string 1 is open, the open A is
  // a natural consequence of thumb bass + open chord shape, not a sandwiching problem.
  if (v.frets[0] >= 1 && v.frets[0] <= 3 && v.frets[1] === 0 && v.frets.length >= 4 && v.frets[2] > 0) {
    score += 12;
  }

  return score;
}

/**
 * Convert a voicing to a standard chord notation string.
 * Uses dash separators when any fret >= 10 for readability.
 * e.g., [−1, 3, 2, 0, 1, 0] → "x32010"
 * e.g., [8, 10, 10, 8, 8, 8] → "8-10-10-8-8-8"
 */
export function voicingToString(frets: number[]): string {
  const hasDoubleDigit = frets.some(f => f >= 10);
  if (hasDoubleDigit) {
    return frets.map(f => f === -1 ? 'x' : f.toString()).join('-');
  }
  return frets.map(f => f === -1 ? 'x' : f.toString()).join('');
}

// ====================================================================
// CAGED shape classification
// ====================================================================
//
// The CAGED system maps every voicing to one of 5 open-chord shapes
// (C, A, G, E, D) that can be moved up the neck with barres/shifts.
//
// Each shape is identified by:
//   1. Which string carries the root as the lowest sounding note
//   2. The interval layout across the sounding strings
//
// Shape configurations: each entry defines a family, its root-string geometry,
// and all known quality variants as [quality, displaySuffix, fretPattern].
// Pattern values: -1 = string not part of this shape, ≥0 = fret offset from position.
// position = (rootChroma − openChromas[rootString] − rootOffset + 24) % 12
export interface ShapeConfig {
  shape: CAGEDShape;
  rootString: number;
  rootOffset: number;
  variants: [string, string, number[]][];
}

export const SHAPE_CONFIGS: ShapeConfig[] = [
    // ── E shape (root on string 0) ──
    { shape: 'E', rootString: 0, rootOffset: 0, variants: [
      ['major',  '',      [0, 2, 2, 1, 0, 0]],
      ['minor',  'm',     [0, 2, 2, 0, 0, 0]],
      ['7',      '7',     [0, 2, 0, 1, 0, 0]],
      ['m7',     'm7',    [0, 2, 0, 0, 0, 0]],
      ['maj7',   'maj7',  [0, 2, 1, 1, 0, 0]],
      ['mMaj7',  'mM7',   [0, 2, 1, 0, 0, 0]],
      ['sus4',   'sus4',  [0, 2, 2, 2, 0, 0]],
      ['6',      '6',     [0, 2, 2, 1, 2, 0]],
      ['m6',     'm6',    [0, 2, 2, 0, 2, 0]],
      ['aug',    'aug',   [0, 3, 2, 1, 1, 0]],
    ]},
    // ── A shape (root on string 1) ──
    { shape: 'A', rootString: 1, rootOffset: 0, variants: [
      ['major',  '',      [-1, 0, 2, 2, 2, 0]],
      ['minor',  'm',     [-1, 0, 2, 2, 1, 0]],
      ['7',      '7',     [-1, 0, 2, 0, 2, 0]],
      ['m7',     'm7',    [-1, 0, 2, 0, 1, 0]],
      ['maj7',   'maj7',  [-1, 0, 2, 1, 2, 0]],
      ['mMaj7',  'mM7',   [-1, 0, 2, 1, 1, 0]],
      ['sus2',   'sus2',  [-1, 0, 2, 2, 0, 0]],
      ['sus4',   'sus4',  [-1, 0, 2, 2, 3, 0]],
      ['6',      '6',     [-1, 0, 2, 2, 2, 2]],
      ['m6',     'm6',    [-1, 0, 2, 2, 1, 2]],
      ['aug',    'aug',   [-1, 0, 3, 2, 2, 1]],
    ]},
    // ── C shape (root on string 1, root is 3 frets above position) ──
    { shape: 'C', rootString: 1, rootOffset: 3, variants: [
      ['major',  '',      [-1, 3, 2, 0, 1, 0]],
      ['minor',  'm',     [-1, 3, 1, 0, 1, 3]],
      ['7',      '7',     [-1, 3, 2, 3, 1, 0]],
      ['maj7',   'maj7',  [-1, 3, 2, 0, 0, 0]],
      ['aug',    'aug',   [-1, 3, 2, 1, 1, 0]],
      ['6',      '6',     [-1, 3, 2, 2, 1, 0]],
    ]},
    // ── G shape (root on string 0, root is 3 frets above position) ──
    { shape: 'G', rootString: 0, rootOffset: 3, variants: [
      ['major',  '',      [3, 2, 0, 0, 0, 3]],
      ['7',      '7',     [3, 2, 0, 0, 0, 1]],
    ]},
    // ── D shape (root on string 2) ──
    { shape: 'D', rootString: 2, rootOffset: 0, variants: [
      ['major',  '',      [-1, -1, 0, 2, 3, 2]],
      ['minor',  'm',     [-1, -1, 0, 2, 3, 1]],
      ['7',      '7',     [-1, -1, 0, 2, 1, 2]],
      ['m7',     'm7',    [-1, -1, 0, 2, 1, 1]],
      ['maj7',   'maj7',  [-1, -1, 0, 2, 2, 2]],
      ['sus2',   'sus2',  [-1, -1, 0, 2, 3, 0]],
      ['sus4',   'sus4',  [-1, -1, 0, 2, 3, 3]],
      ['6',      '6',     [-1, -1, 0, 2, 0, 2]],
      ['m6',     'm6',    [-1, -1, 0, 2, 0, 1]],
      ['aug',    'aug',   [-1, -1, 0, 3, 3, 2]],
    ]},
    // ── Dim7 shapes (non-CAGED: symmetric diminished 7th patterns) ──
    // Shape 1: root on string 1, one fret above position (x2313x for Bdim7)
    { shape: 'Dim', rootString: 1, rootOffset: 1, variants: [
      ['dim7',   '',      [-1, 1, 2, 0, 2, -1]],
    ]},
    // Shape 2: root on string 2 (xx0101 for Ddim7)
    { shape: 'Dim', rootString: 2, rootOffset: 0, variants: [
      ['dim7',   '',      [-1, -1, 0, 1, 0, 1]],
    ]},
    // Shape 3: root on string 0, one fret above position (2x1212 for F#dim7)
    { shape: 'Dim', rootString: 0, rootOffset: 1, variants: [
      ['dim7',   '',      [1, -1, 0, 1, 0, 1]],
    ]},
  ];

/**
 * Classify a voicing into its CAGED shape (or a recognized non-CAGED family).
 *
 * We try ALL shape families (CAGED + Dim). For each shape the "position"
 * (barre fret) is derived from the root note and the shape's root-string
 * relationship. We compare the voicing's actual frets against each reference
 * variant, but only on mutually-voiced strings — muted strings in the voicing
 * or strings not part of the shape pattern are skipped.
 */
export function classifyCAGED(
  voicing: Voicing,
  rootPitchClass: string | undefined,
  tuning: string[]
): CAGEDInfo | undefined {
  if (!rootPitchClass) return undefined;

  const rootChroma = Note.chroma(rootPitchClass);
  if (rootChroma === undefined) return undefined;

  const frets = voicing.frets;
  const openChromas = tuning.map(t => Note.chroma(t)!);

  // Try every shape config × variant.
  let bestShape: CAGEDShape | undefined;
  let bestQuality = '';
  let bestLabel = '';
  let bestDiffs = Infinity;
  let bestCompared = 0;
  let bestPosition = 0;

  for (const config of SHAPE_CONFIGS) {
    const position = (rootChroma - openChromas[config.rootString] - config.rootOffset + 24) % 12;

    for (const [quality, displayLabel, pattern] of config.variants) {
      let diffs = 0;
      let compared = 0;

      for (let i = 0; i < 6; i++) {
        if (frets[i] === -1) continue;    // voicing string muted → skip
        if (pattern[i] === -1) continue;  // not part of this shape → skip
        const expectedFret = pattern[i] + position;
        compared++;
        if (frets[i] !== expectedFret) diffs++;
      }

      // Must compare enough strings; variants need stricter coverage
      if (compared < 3) continue;
      if (diffs > 0 && compared < 4) continue;
      if (diffs > 2) continue;

      // Better match: fewer diffs first, then more compared strings
      if (diffs < bestDiffs || (diffs === bestDiffs && compared > bestCompared)) {
        bestDiffs = diffs;
        bestCompared = compared;
        bestShape = config.shape;
        bestQuality = quality;
        bestLabel = displayLabel;
        bestPosition = position;
      }
    }
  }

  if (!bestShape) return undefined;

  const quality = bestQuality;
  const baseLabel = `${bestShape}${bestLabel} shape`;
  const label = bestDiffs === 0 ? baseLabel : `${baseLabel} var.`;

  return { shape: bestShape, quality, position: bestPosition, label };
}

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PREFER_FLAT = new Set([1, 3, 6, 8, 10]); // Db, Eb, Gb, Ab, Bb

export interface ShapeVoicingResult {
  chordName: string;
  rootNote: string;
  quality: string;
  displaySuffix: string;
  shapeLabel: string;
  voicing: Voicing;
}

/**
 * Given a shape family and a fret position, compute all voicings (one per variant)
 * that the shape produces at that position.
 */
export function getShapeVoicingsAtPosition(
  config: ShapeConfig,
  position: number,
  tuning: string[]
): ShapeVoicingResult[] {
  const openChromas = tuning.map(t => Note.chroma(t)!);
  // Root chroma = openChroma[rootString] + rootOffset + position
  const rootChroma = (openChromas[config.rootString] + config.rootOffset + position) % 12;
  // Pick a nice root name
  const rootNote = PREFER_FLAT.has(rootChroma) ? NOTE_NAMES_FLAT[rootChroma] : NOTE_NAMES_SHARP[rootChroma];

  const results: ShapeVoicingResult[] = [];

  for (const [quality, displaySuffix, pattern] of config.variants) {
    // Compute actual frets
    const frets: number[] = [];
    for (let s = 0; s < 6; s++) {
      if (pattern[s] === -1) {
        frets.push(-1);
      } else {
        frets.push(pattern[s] + position);
      }
    }

    // Compute notes from frets
    const notes: string[] = [];
    const pitchClasses: string[] = [];
    for (let s = 0; s < 6; s++) {
      if (frets[s] === -1) continue;
      const note = Note.transpose(tuning[s], Interval.fromSemitones(frets[s]));
      if (note) {
        notes.push(note);
        pitchClasses.push(Note.pitchClass(note));
      }
    }

    const barres = detectBarres(frets);
    const fretted = frets.filter(f => f > 0);
    const bassFret = fretted.length > 0 ? Math.min(...fretted) : 0;
    const positionGroup = position === 0 ? 'Open position' : `Fret ${position}`;

    // Build chord name
    const chordName = `${rootNote}${displaySuffix}`;
    const shapeLabel = `${config.shape}${displaySuffix} shape`;

    const voicing: Voicing = {
      frets,
      barres,
      bassFret,
      notes,
      pitchClasses,
      caged: {
        shape: config.shape,
        quality,
        position,
        label: shapeLabel,
      },
      rank: 0,
      positionGroup,
    };

    results.push({
      chordName: chordName || rootNote,
      rootNote,
      quality,
      displaySuffix,
      shapeLabel,
      voicing,
    });
  }

  return results;
}
