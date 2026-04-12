---
name: cross-module-navigation
description: "Cross-module navigation and voicing consistency for guitar-app. USE FOR: debugging navigation between tabs, fixing index mismatches, handling voicing injection, understanding effect ordering, adding new cross-tab navigation. Covers callback routing, dual-array index encoding, filtered-vs-unfiltered array pitfalls, $effect stomping, and the voicing injection pattern."
---

# Cross-Module Navigation & Voicing Consistency

## Core Problem: Voicings Are Computed, Not Stored

Voicings are generated on-the-fly by DFS search (`findVoicings()`), not pre-stored in a database. Different modules compute or receive voicings independently, so **a voicing visible in one module may not exist in another module's search results.** This creates consistency challenges whenever the user navigates between tabs carrying voicing data.

Causes of voicing absence in search results:
- **maxResults cap** (default 20) — voicing ranked below the cutoff
- **Redundant upper mute elimination** — voicing pruned during post-DFS filtering
- **Different search parameters** — different tuning, maxFret, or maxSpan settings
- **Quality filters** — non-root bass note, insufficient string coverage

**Golden rule:** When navigating with a specific voicing, always verify the voicing exists in the destination's data, and inject it if missing.

## Navigation Callback Architecture

All cross-tab navigation routes through [App.svelte](src/App.svelte) via two hub functions:

```
navigateToChord(chordName, frets?)   → sets finderChord, finderFrets, switches to 'finder'
navigateToShape(shape, position, variantIdx?)  → sets shapeNav*, switches to 'shapes'
```

### All Navigation Routes

| From → To | Callback Prop | Data Passed |
|-----------|---------------|-------------|
| Identifier → Finder | `onChordSelect(name, frets)` | chord symbol + fret array |
| ShapeExplorer → Finder | `onNavigateToChord(name)` | chord symbol only |
| ProgressionBuilder → Finder | `onNavigateToChord(name)` | chord symbol only |
| Finder → ShapeExplorer | `onNavigateToShape(shape, pos, idx?)` | CAGED shape + position + variant |
| ProgressionBuilder → Finder/Identifier/Shapes | `onNavigateToFinder/Identifier/Shapes()` | (none or add-to-cell mode) |

**Only Identifier → Finder passes fret data.** All other routes pass names/shapes only. When frets are passed, the destination must resolve them to a concrete voicing in its own data layer.

## Dual-Array Index Encoding (ChordFinder)

`selectedIdx` encodes position across two separate arrays in a single integer:

```
selectedIdx in [0, voicings.length - 1]        → voicings[selectedIdx]
selectedIdx in [voicings.length, ...]           → otherVoicings[selectedIdx - voicings.length]
selectedIdx === null                            → nothing selected
```

The `selectedVoicing` derived resolves this:
```ts
if (selectedIdx < voicings.length) return voicings[selectedIdx];
return otherVoicings[selectedIdx - voicings.length] ?? null;
```

### Filtered vs Unfiltered Arrays — Index Mapping Required

Three filtered views exist, each a **subset** of the base arrays:

| Filtered | Source | Filters |
|----------|--------|---------|
| `filteredVoicings` | `voicings` | fretboard notes + position + CAGED |
| `filteredOtherVoicings` | `otherVoicings` | position group only |
| `displayGroups` | `filteredVoicings` | grouped by position, with `origIdx` |

**Critical rule:** Template `{#each}` loop indices from filtered arrays do NOT correspond to positions in the base arrays. Always map back using `.indexOf(v)`:

```svelte
<!-- WRONG: idx is position in filteredOtherVoicings, not otherVoicings -->
{#each filteredOtherVoicings as v, idx}
  <div class:active={selectedIdx === voicings.length + idx}>

<!-- CORRECT: otherOrigIdx is position in otherVoicings -->
{#each filteredOtherVoicings as v}
  {@const otherOrigIdx = otherVoicings.indexOf(v)}
  <div class:active={selectedIdx === voicings.length + otherOrigIdx}>
```

Same pattern applies to `displayGroups`:
```svelte
{#each group.items as item}
  <!-- item.origIdx = voicings.indexOf(item.voicing) — already computed in the derived -->
  <div class:active={selectedIdx === item.origIdx}>
```

### When Adding New Filtered Views

Always compute `origIdx` from the base array, never use the `{#each}` loop index for selection or comparison against `selectedIdx`.

## $effect Ordering and Stomping

ChordFinder has multiple `$effect()` blocks that can interact in harmful ways:

| Effect | Dependencies | Action | Risk |
|--------|-------------|--------|------|
| Navigation effect | `initialChord`, `initialFrets` | Loads voicings, injects missing, sets `selectedIdx` | Sets state that others react to |
| Auto-select effect | `filteredVoicings` | Picks first filtered voicing as `selectedIdx` | **Can overwrite navigation's selectedIdx** |
| Persist effect | Multiple state fields | Syncs to localStorage | Captures intermediate state |
| Filter-clear effect | `selectedFretFilter` | Clears `filterPositions` | Changes filter state mid-chain |

### The Stomping Pattern

When navigating with frets:
1. Navigation effect runs inside `untrack()`, sets `selectedIdx` to an "other" voicing
2. But it also sets `selectedFretFilter`, which triggers `filteredVoicings` to recompute
3. Auto-select effect fires, sees `voicings[selectedIdx]` is undefined (it's an "other" voicing), and overwrites `selectedIdx` with the first main voicing

**Guard pattern:** The auto-select effect must check whether `selectedIdx` already points to an "other" voicing and skip:

```ts
$effect(() => {
  const fv = filteredVoicings;
  untrack(() => {
    if (fv.length > 0 && selectedFretFilter) {
      if (selectedIdx !== null && selectedIdx >= voicings.length) return; // ← guard
      if (selectedIdx === null || !fv.includes(voicings[selectedIdx!])) {
        selectedIdx = voicings.indexOf(fv[0]);
      }
    }
    // ...
  });
});
```

**General rule:** Any `$effect` that auto-adjusts `selectedIdx` must respect selections made by the navigation effect. Check `selectedIdx >= voicings.length` before overwriting.

## Voicing Injection Pattern

When navigating from Identifier with frets that don't exist in either `voicings` or `otherVoicings`:

```ts
// 1. Construct a Voicing from raw frets
const injected = fretsToVoicing(frets, selectedTuning.notes);

// 2. Classify CAGED shape
const rootPC = chordNotes[0];
injected.caged = rootPC ? classifyCAGED(injected, rootPC, selectedTuning.notes) : undefined;

// 3. Compute position group (must match filter system)
const fretted = frets.filter(f => f > 0);
const hasOpen = frets.some(f => f === 0);
injected.positionGroup = (fretted.length === 0 || hasOpen)
  ? 'Open position'
  : `Fret ${Math.min(...fretted)}`;

// 4. Assign rank and append
injected.rank = otherVoicings.length + 1;
otherVoicings = [...otherVoicings, injected];

// 5. Compute unified index AFTER mutation
matchIdx = voicings.length + otherVoicings.length - 1;
```

**Key details:**
- Must compute `positionGroup` to match the filter system, or the voicing won't appear under any fret filter
- Must set `rank` for display ordering
- Must compute `matchIdx` AFTER appending to `otherVoicings` (length has changed)
- Must expand the "Other possibilities" collapsed group (`collapsedGroups.delete('__others__')`)
- Must set `selectedFretFilter` to the injected voicing's `positionGroup` so it appears in the filtered view

## Checklist: Adding New Cross-Module Navigation

1. **Define the callback prop** in the source component's Props interface
2. **Wire through App.svelte** — add state variables and a hub function
3. **Pass as component prop** to both source (trigger) and destination (effect)
4. **In the destination's navigation $effect:**
   - Load data (e.g., `loadVoicings()`) inside `untrack()`
   - Search both arrays if applicable (main + other)
   - Inject if missing (use `fretsToVoicing` + classify + position group)
   - Set selection index using base array positions
   - Set any filter state (e.g., `selectedFretFilter`) to ensure visibility
   - Expand collapsed groups if targeting an initially-hidden section
   - Scroll to selection after `tick()`
5. **Guard other $effects** that auto-adjust selection against overwriting
6. **Test the round-trip:** navigate out and back — does the selection survive?
