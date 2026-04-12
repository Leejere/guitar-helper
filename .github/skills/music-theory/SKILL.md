---
name: music-theory
description: "Music theory engine for guitar-app. USE FOR: understanding chord generation, voicing search algorithm (DFS), playability scoring, CAGED shape system, chord filtering, scale modes, barre detection, enharmonic handling. Covers chord database (44 types x 17 roots), voicing DFS search, 14-factor scoring, 6 CAGED shapes, slash chord handling."
---

# Music Theory Engine

Three core modules power all music logic. All are pure TypeScript with no UI dependencies.

## Chord Database — [src/lib/chords.ts](src/lib/chords.ts)

### What's Included

**44 chord type symbols** spanning: triads (M, m, dim, aug, 5), sevenths (maj7, 7, m7, dim7, m7b5), extended (9, 11, 13), sus (sus2, sus4), altered (7b5, 7#5, 7b9, 7#9, alt7), and add chords.

**17 roots**: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B

Database is lazy-loaded and memoized via `getChordDatabase()`:
1. Generate base chords: 44 types × 17 roots ≈ 750 entries
2. Validate each via `tonal.Chord.get()` — skip invalid
3. Generate **slash chords**: for each base chord, create inversions with non-root chord tones as bass
4. Register both enharmonic spellings (C# and Db) via chroma mapping

### 9 Categories

`ALL_CATEGORIES`: Major, Minor, Dominant, Diminished, Augmented, Suspended, Extended, Altered, Other

Categorization via regex-based suffix matching with precedence chain.

### 5-Filter Pipeline — `filterChords()`

| Filter | Logic |
|--------|-------|
| `search` | Case-insensitive symbol/typeName matching with relevance scoring (exact > starts-with > contains). When search contains `/` with a valid bass note (e.g. "C/B"), dynamically generates non-inversion slash entries from matching base chords. |
| `roots` | Multi-select: filter by chroma (pitch class number 0-11) |
| `categories` | Multi-select: match chord category |
| `scale` | Filter to diatonic chords of a scale+mode (e.g., "C dorian") |
| `slashBass` | When set (e.g. "E"), filters root-position chords only, then generates dynamic `chord/bass` entries. Skips redundant slash (C/C → C). |

### Scale Mode System

**9 modes**: ionian, dorian, phrygian, lydian, mixolydian, aeolian, locrian, harmonic minor, melodic minor

`computeScaleDiatonicSymbols()`: For each scale degree, stacks thirds to build triads (3 notes) and 7ths (4 notes), computes a **pitch-class chroma** (12-bit string where each bit = a semitone present), and matches against database entries by their pitch-class chromas. This correctly identifies only chords whose actual notes match diatonic note sets. Slash chords included if parent is diatonic AND bass note is in scale.

**Critical:** Uses `pitchClassChroma()` (actual note pitch classes), NOT `Chord.get().chroma` (interval structure). Tonal's `.chroma` is type-based — all major triads share the same chroma regardless of root. Pitch-class chroma is root-specific.

### Scale Degree Grouping

`getScaleChordsByDegree()` returns `ScaleDegreeGroup[]` — one per scale degree with:
- `triadSymbols: Set<string>` — the degree's triad (matched by root + suffix)
- `symbols: Set<string>` — triad + diatonic extensions (7ths, 6ths) sharing the same root
- `romanLabel` — e.g. "I", "ii", "iii°", "IV+"

Extensions are found by intersecting `getScaleDiatonicSymbols()` with `entry.root === degreeRoot`. E.g., C Ionian degree I: C (triad), Cmaj7, C6 (extensions).

In the UI (`scaleDegreeGroups` derived in ChordFinder), chords are sorted: triads first, extensions second — using `triadSymbols` membership.

## Voicing Generation — [src/lib/voicings.ts](src/lib/voicings.ts)

### Overview

`findVoicings(chordSymbol, tuning, options?)` generates all playable guitar voicings for a chord.

**Algorithm**: Depth-first search (DFS) over all combinations of fret positions across 6 strings, with aggressive pruning to keep search fast.

**Key parameters**: `maxFret` (default 15), `maxSpan` (default 4 frets), `maxResults` (default 20), `othersOut` (optional array to collect excluded voicings)

**Pipeline**:
1. Input normalization (chord tones, omittable notes, enharmonic respelling)
2. Candidate generation (valid frets per string)
3. DFS with pruning (span, finger count, open+high)
4. Post-search filtering (bass, string coverage, redundant mutes)
5. Scoring & ranking (14-factor playability)
6. CAGED classification
7. If `othersOut` provided: physically playable voicings excluded by quality filters or maxResults cap are ranked, classified, and pushed into the array

Full DFS algorithm details: [voicing-dfs-algorithm.md](./references/voicing-dfs-algorithm.md)

### Omittable Notes

Standard guitar voicing rules allow omitting certain notes:
- **Perfect 5th** (7 semitones): omittable if 4+ note chord (redundant in overtone series)
- **9th** (1-2 semitones): omittable if 6+ note chord
- **11th** (5-6 semitones): omittable if 7+ note chord
- Augmented/diminished 5ths are **never** omitted (they're characteristic)

### Scoring — 14 Factors

`scoreVoicing()` produces a numeric playability score. Higher = more playable. Key factors include root-as-bass (+40), open position bonus (+20), fret span penalty (-4 each fret), inner mute penalty (-15), barre reward (+10). Full breakdown in [voicing-dfs-algorithm.md](./references/voicing-dfs-algorithm.md#scoring).

### Barre Detection

`detectBarres()`: Identifies barres (index finger laid across multiple strings at same fret). Checks: min-fret or max-fret position, no open strings breaking continuity, all covered strings fretted at ≥ barre fret.

## CAGED Shape System

6 shape families (E, A, C, G, D, Dim) with variant patterns for different chord qualities.

`classifyCAGED()`: Matches a voicing against known shape patterns. Requires ≥3 matched strings, allows ≤2 differences. Labels variants with "shape var." suffix if diffs > 0.

`getShapeVoicingsAtPosition()`: Generates one voicing per variant at a given barre position.

Full CAGED details: [caged-shapes.md](./references/caged-shapes.md)

## Related Chords — `getRelatedChords()`

Returns `RelatedChord[]` (symbol + relation label) for a given chord, based on the `CHORD_RELATIONS` rule table. Each rule maps a target suffix to the source suffixes it's reachable from.

**Relation categories (in priority order):**
1. **Quality changes**: Major ↔ Minor (e.g., C → Cm)
2. **Seventh extensions**: 7th, maj7, m7 (e.g., C → C7, Cm → Cm7)
3. **Suspended**: sus4, sus2 (e.g., C → Csus4)
4. **Add chords**: add9, madd9 (e.g., C → Cadd9)
5. **Extended**: 9th, m9, maj9 (e.g., C7 → C9)
6. **Diminished/Augmented**: dim, aug, dim7, m7♭5
7. **Sixth**: 6th, m6
8. **Power**: 5 (e.g., C → C5)
9. **7sus4**: from sus4 or 7

Only chords that exist in the database are returned. The first 4 are shown inline as chips; overflow goes to a "..." dropdown. Used in ChordFinder's voicing phase.

## Music Utilities — [src/lib/music.ts](src/lib/music.ts)

### Key Functions

| Function | Purpose |
|----------|---------|
| `identifyChords(fretPositions, tuning)` | Identify chords from fret selections. Tries all combos of unspecified strings (open/muted). Returns exact + vague matches. |
| `fretsToVoicing(frets, tuningNotes)` | Convert fret array → Voicing object (with barres, notes) |
| `getChord(symbol)` | Wrapper around `tonal.Chord.get()` |
| `getIntervalLabel(rootNote, note)` | Returns interval name (R, ♭2, 2, ♭3, 3, 4, ♭5, 5, ♯5, 6, ♭7, 7) |
| `displayAccidental(name)` | `"C#"` → `"C♯"`, `"Bb"` → `"B♭"` |
| `normalizeInput(name)` | Reverse of above for API calls |
| `ALL_ROOTS` | All 12 chromatic root notes |

### Interval Labels

`SEMITONE_INTERVAL_LABELS`: `['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♯5', '6', '♭7', '7']`

### Chord Identification Algorithm

`identifyChords()`:
1. Build fret array with NaN for unspecified strings
2. Generate all 2^n open/muted combinations for unknowns
3. Extract notes, run `tonal.Chord.detect()`, deduplicate
4. **Exact matches**: all user selections used
5. **Vague matches** (3+ selections): iteratively drop each selection, try muted (capped at 64 combos/drop)
