# Voicing DFS Algorithm

Deep dive into `findVoicings()` in [src/lib/voicings.ts](../../src/lib/voicings.ts).

## Step 1: Input Normalization

```
Input: chordSymbol (e.g., "Cmaj7"), tuning, options
```

1. Extract chord semitone set from pitch classes (e.g., C→0, E→4, G→7, B→11)
2. For slash chords: add `requiredBass` chroma to chord tones
3. Identify `rootSemitone` from first note
4. Build `respellMap` for enharmonic consistency (respell accidentals to match chord context)
5. Calculate **omittable notes** (perfect 5th if ≥4 notes, 9th if ≥6, 11th if ≥7; never omit aug/dim 5ths)

## Step 2: Candidate Generation

For each of 6 strings:
- Get open string pitch from tuning
- Enumerate all frets `0..maxFret` where the note's pitch class matches a chord tone
- Always add `-1` (muted) as an option
- Result: `candidates[stringIdx]` — list of valid frets for that string

## Step 3: DFS Search

### Recursive Function Signature

```typescript
function search(
  stringIdx: number,        // current string being assigned (0-5)
  current: number[],        // frets assigned so far
  minFret: number,          // lowest non-zero fret assigned
  maxFretUsed: number,      // highest fret assigned
  coveredSemitones: Set<number>,  // chord tones covered so far
  fingerCount: number,      // fretted (non-open, non-muted) strings
  hasOpen: boolean          // whether any open (fret 0) string exists
)
```

### Base Case (stringIdx === 6)

When all 6 strings assigned:
1. **Semitone coverage**: all required chord tones present (omittable ones optional)
2. **Inner mutes**: allow at most 1 muted string between first and last sounding string
3. **Slash chord bass**: if slash chord, verify lowest sounding note matches required bass chroma
4. Build Voicing object with respelled note names, detect barres
5. Add to results array

### Pruning Rules (during recursion)

For each candidate fret on current string:

1. **Span check**: If both current and previous strings are fretted (not open), fret distance must be ≤ `maxSpan` (default 4)
2. **Open + high prune**: If open strings exist AND fretted notes would exceed fret 4, skip (unplayable hand stretch between nut and high frets)
3. **Finger count**: Cap at 6 fretted strings (barres reduce effective count later)
4. Recurse to next string with updated state

### Why DFS Works Well

- 6 strings × ~5-10 candidates each = manageable search space with pruning
- Pruning eliminates most branches early (span check alone cuts ~90%)
- No need for memoization — each path is unique
- Results collected in a single pass

## Step 4: Post-Search Filtering

After DFS completes with all raw voicings:

### Effective Finger Count
```typescript
function effectiveFingerCount(v: Voicing): number {
  let fingers = v.frets.filter(f => f > 0).length;
  for (const barre of v.barres) {
    // Each barre covers multiple strings with one finger
    const covered = v.frets.filter((f, s) =>
      s >= barre.fromString && s <= barre.toString && f === barre.fret
    ).length;
    fingers -= (covered - 1);  // barre uses 1 finger for N strings
  }
  return fingers;
}
```

### Filters Applied (in order)

1. **Effective fingers ≤ 4**: After barre adjustment, must be playable with 4 fingers
2. **Bass requirement**: Non-slash chords must have root as lowest sounding note
3. **Minimum 3 sounding strings**: At least 3 strings must be played
4. **Bass coverage**: At least 1 of strings 0-2 (low E, A, D) must sound
5. **Treble coverage**: At least 1 of strings 3-5 (G, B, high E) must sound
6. **Redundant upper mute elimination**: `filterRedundantUpperMutes()` — removes voicings with muted treble strings if another voicing exists that matches all voiced strings AND voices at least one of the muted treble strings (the "submuted" voicing is strictly worse)

## Step 5: Scoring {#scoring}

`scoreVoicing()` — 14-factor additive scoring system. Higher score = more playable/desirable.

| # | Factor | Score | Condition |
|---|--------|-------|-----------|
| 1 | Open + high mix | **-100** | Open strings present AND fretted notes > fret 4 (unplayable stretch) |
| 2 | Sandwiched opens | **-3 to -12** | Open strings between fretted strings; worse if neighbors at same fret (blocks barre opportunity) |
| 3 | Root as bass | **+40** / **-15** | Root is lowest sounding note (+40) or not (-15) |
| 4 | Open position | **+20** or **+10** | maxFret ≤ 3 (+20) or ≤ 5 (+10) — lower positions easier |
| 5 | Open string count | **+2 each** | Prefer open strings (easier to play) |
| 6 | Position preference | **-4 × avgFret** | Lower average fret position preferred |
| 7 | Muted strings | **-5 to -17** | Treble mutes penalized more than bass mutes |
| 8 | Inner mutes | **-15 each** | Muted string between sounding strings (hard to execute) |
| 9 | Sounding count | **+3 each** | More sounding strings = fuller sound |
| 10 | Fret span | **-4 × span** | Smaller span = easier fingering |
| 11 | Barre reward | **+10** | Voicing has a barre (natural hand position) |
| 12 | Finger efficiency | **-4 × excess** | Penalize if effective fingers > 4 |
| 13 | Completeness | **-3 each** | Penalize each missing chord semitone |
| 14 | Bass string | **-15** or **-5** | Lowest sounding note should be on strings 0-2 |
| 15 | Thumb-wrap | **+12** | Special pattern: string 0 fretted 1-3, string 1 open, string 2+ fretted |

### Ranking

`rankVoicings()`:
1. Sort by `scoreVoicing()` descending
2. Take top N (default `maxResults=20`)
3. Classify each with `classifyCAGED()`
4. Assign `positionGroup` label ("Open position" or "Fret N")
5. Assign ranks 1..N

## Barre Detection — `detectBarres()`

### Algorithm

1. Find all frets appearing on 2+ strings
2. Filter to only **min-fret** (index finger) or **max-fret** (lay-flat) barres
3. Require 3+ strings for max-fret barres
4. **Feasibility checks**:
   - No fret-0 (open) strings between lowest sounding string and barre end
   - All *sounding* strings from..to fretted at ≥ barre fret (muted strings allowed — barre lays across them)
   - Treble-side strings beyond barre end fretted at ≥ barre fret
5. Return `Barre[]` with `{ fret, fromString, toString }`
