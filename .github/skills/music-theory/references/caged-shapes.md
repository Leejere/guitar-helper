# CAGED Shape System

Deep dive into CAGED shapes in [src/lib/voicings.ts](../../src/lib/voicings.ts).

## Overview

The CAGED system maps open chord shapes (C, A, G, E, D) up the neck using barre positions. This app extends it with a **Dim** shape for diminished chords.

## 6 Shape Families — `SHAPE_CONFIGS`

| Shape | Root String | Root Offset | # Variants | Example Qualities |
|-------|------------|-------------|-----------|-------------------|
| **E** | 0 (low E) | 0 | 10 | M, m, 7, m7, maj7, mM7, sus4, 6, m6, aug |
| **A** | 1 (A) | 0 | 11 | M, m, 7, m7, maj7, mM7, sus2, sus4, 6, m6, aug |
| **C** | 1 (A) | 3 | 6 | M, m, 7, maj7, aug, 6 |
| **G** | 0 (low E) | 3 | 2 | M, 7 |
| **D** | 2 (D) | 0 | 10 | M, m, 7, m7, maj7, sus2, sus4, 6, m6, aug |
| **Dim** | varies | varies | 3 | Symmetric dim7 patterns |

### Variant Structure

Each variant defines:
```typescript
{
  quality: string,     // "M", "m", "7", "maj7", etc.
  pattern: number[]    // 6-element array: -1 = muted, 0+ = fret offset from position
}
```

**Pattern notation**: Fret values are **offsets from the barre position**. A pattern `[0, 2, 2, 1, 0, 0]` at position 3 means frets `[3, 5, 5, 4, 3, 3]`.

### Position Formula

```
position = (rootChroma - openStringChroma[rootString] - rootOffset + 24) % 12
```

Where:
- `rootChroma`: semitone number of chord root (C=0, C#=1, ..., B=11)
- `openStringChroma[rootString]`: semitone of open string at root position
- `rootOffset`: shape-specific offset (0 for E/A/D, 3 for C/G)
- `+24` ensures positive modulo

**Example**: E-shape, root = A (chroma 9), open low E (chroma 4), offset 0:
`position = (9 - 4 - 0 + 24) % 12 = 5` → barre at fret 5

## `classifyCAGED()` — Shape Matching

Given a voicing, determines which CAGED shape it most closely matches.

### Algorithm

1. For each `ShapeConfig`:
   - Compute position from root chroma and shape geometry
   - For each variant pattern:
     - Compare voicing frets vs pattern frets (shifted by position)
     - Skip muted strings in voicing or `-1` entries in pattern
     - Count `comparedStrings` and `diffs` (mismatches)
2. **Selection criteria**:
   - Require `comparedStrings ≥ 3`
   - If `diffs > 0`, require `comparedStrings ≥ 4`
   - Max `diffs = 2`
   - Among valid matches: fewest diffs, then most compared strings
3. Label: exact match → `"E shape"`, with diffs → `"E shape var."`

## `getShapeVoicingsAtPosition()`

Generates voicings for a shape at a specific barre position.

### Process

1. Takes `ShapeConfig` and position (fret number)
2. For each variant:
   - Apply position offset: `fret = patternFret + position`
   - Select enharmonic root using `PREFER_FLAT` set
   - Build chord name: `rootNote + quality`
   - Compute notes, detect barres
3. Returns `ShapeVoicingResult[]` with:
   - `chordName`, `quality`, `voicing` (Voicing object)

### PREFER_FLAT Set

Chromas `{1, 3, 6, 8, 10}` prefer flat spellings:
- Chroma 1 → Db (not C#)
- Chroma 3 → Eb (not D#)
- Chroma 6 → Gb (not F#)
- Chroma 8 → Ab (not G#)
- Chroma 10 → Bb (not A#)

All others use sharp or natural spellings.

## Shape Coverage

Not all chord qualities have all shapes. Coverage by shape:

| Quality | E | A | C | G | D | Dim |
|---------|---|---|---|---|---|-----|
| Major | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Minor | ✓ | ✓ | ✓ | | ✓ | |
| 7 | ✓ | ✓ | ✓ | ✓ | ✓ | |
| m7 | ✓ | ✓ | | | ✓ | |
| maj7 | ✓ | ✓ | ✓ | | ✓ | |
| sus2 | | ✓ | | | ✓ | |
| sus4 | ✓ | ✓ | | | ✓ | |
| dim7 | | | | | | ✓ (×3) |
| 6 | ✓ | ✓ | ✓ | | ✓ | |
| m6 | ✓ | ✓ | | | ✓ | |
| aug | ✓ | ✓ | ✓ | | ✓ | |
| mM7 | ✓ | ✓ | | | | |
