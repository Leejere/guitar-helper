---
name: state-management
description: "State management patterns for guitar-app. USE FOR: adding new state, understanding reactivity, working with localStorage persistence, debugging state bugs, understanding cross-component communication. Covers Svelte 5 runes, singleton pattern, localStorage persist/hydrate, 8 state singletons, derived chains, cross-tab navigation."
---

# State Management

## Core Pattern: Svelte 5 Runes + Singleton Classes

Every stateful module follows this pattern:

```typescript
// src/lib/example-state.svelte.ts
class ExampleState {
  field = $state('default')           // reactive field
  computed = $derived(this.field + '!')  // derived value

  constructor() { this.hydrate() }    // load from localStorage on init

  mutate(val: string) {
    this.field = val
    this.persist()                    // save after every mutation
  }

  private persist() {
    try { localStorage.setItem('guitar-app-example', JSON.stringify({ field: this.field })) }
    catch {}  // localStorage may be unavailable
  }

  private hydrate() {
    try {
      const raw = localStorage.getItem('guitar-app-example')
      if (raw) { const d = JSON.parse(raw); this.field = d.field ?? this.field }
    } catch {}  // corrupt data → keep defaults
  }
}

export const exampleState = new ExampleState()  // singleton
```

**Key principles:**
1. **`$state()`** for reactive fields — triggers UI re-renders
2. **`$derived()`** for computed values — auto-updates when dependencies change
3. **Singleton export** — one instance shared across all components
4. **`persist()` after every mutation** — immediate localStorage save
5. **`hydrate()` in constructor** — restore state on page load
6. **try/catch** around localStorage — graceful degradation

## Svelte 5 Runes Reference

| Rune | Purpose | Example |
|------|---------|---------|
| `$state()` | Reactive mutable field | `count = $state(0)` |
| `$derived()` | Computed from reactive deps | `double = $derived(this.count * 2)` |
| `$effect()` | Side effect on reactive changes | `$effect(() => { console.log(this.count) })` |
| `$props()` | Component props declaration | `let { name, onchange } = $props()` |
| `$bindable()` | Two-way bindable prop | `let { value = $bindable() } = $props()` |

## All State Singletons

### Pool — [src/lib/pool.svelte.ts](src/lib/pool.svelte.ts)
Manages voicing collection. Storage key: `guitar-app-pool`

| Field/Method | Type | Purpose |
|-------------|------|---------|
| `entries` | `PoolEntry[]` | All saved voicings |
| `keySet` | `Set<string>` | O(1) duplicate detection |
| `add(voicing, tuning, chordName)` | method | Add entry (skip if duplicate) |
| `remove(key)` | method | Remove by key |
| `get(key)` | method | Retrieve entry |
| `has(key)` | method | Check existence |
| `clear()` | method | Empty pool |
| `keyFor(frets, chordName)` | method | Generate key string |

Key format: `"0,3,3,5,-1,3:C"` (frets joined by comma + colon + chordName)

### Progression — [src/lib/progression.svelte.ts](src/lib/progression.svelte.ts)
Manages chord progression grid. Storage key: `guitar-app-progression`

| Field | Type | Purpose |
|-------|------|---------|
| `cells` | `ProgressionCell[]` | Grid of `{id, poolKey}` |
| `title` | `string` | Progression name |
| `columns` | `4` | Fixed grid layout constant |
| `pendingCellIdx` | `number \| null` | Target for next add |
| `pendingNav` | `string \| null` | Cross-tab navigation trigger |

Key methods: `pushFromPool`, `pushToCell`, `returnFromProgression`, `swapCells`, `moveToEmpty`, `relocateCell`, `insertCellAt`, `deleteCellAt`, `duplicateCellAt`, `addMoreCells`, `duplicateSelection`, `deleteSelection`, `moveSelection`, `toCompactUrl`, `fromCompactUrl`, `loadFromSnapshot`

### Chord Finder — [src/lib/chord-finder-state.svelte.ts](src/lib/chord-finder-state.svelte.ts)
Storage key: `guitar-app-chord-finder`

Fields: `selectedTuning`, `phase`, `searchText`, `filterRoots`, `filterKeys`, `filterCategories`, `filterVoicings`, `filterScaleRoot`, `filterScaleMode`, `activeChordSymbol`, `showIntervals`, `selectedIdx`

### Identifier — [src/lib/identifier-state.svelte.ts](src/lib/identifier-state.svelte.ts)
Storage key: `guitar-app-identifier`

Fields: `selectedTuning`, `selectedPositions[]`

### Fretboard Map — [src/lib/fretboard-map-state.svelte.ts](src/lib/fretboard-map-state.svelte.ts)
Storage key: `guitar-app-fretboard-map`

Fields: `selectedTuning`, `mode` (`'notes'` | `'intervals'`), `rootNote`

### Shape Explorer — [src/lib/shape-explorer-state.svelte.ts](src/lib/shape-explorer-state.svelte.ts)
Storage key: `guitar-app-shape-explorer`

Fields: `filterShape` (CAGEDShape | `''`), `filterVariants[]`, `selectedPosition`, `selectedResultIdx`

### Toast — [src/lib/toast.svelte.ts](src/lib/toast.svelte.ts)
No persistence. Transient notifications.

Fields: `message`, `visible`, auto-hide timer (1500ms)
Method: `show(msg)` — displays toast, auto-clears

### Responsive — [src/lib/responsive.svelte.ts](src/lib/responsive.svelte.ts)
No persistence. Tracks viewport.

Field: `windowWidth` — updates on `window.resize` event

## Cross-Tab Navigation

Components don't navigate directly. They use callback props:

```typescript
// ProgressionBuilder receives these as props:
onNavigateToFinder?:     (chordName: string) => void
onNavigateToChord?:      (chordName: string, voicingIdx?: number) => void
onNavigateToIdentifier?: () => void
onNavigateToShapes?:     (shape: string, position: number, variantIdx: number) => void
```

**App.svelte** wires these callbacks to set `activeTab` + initial state on the target page.

**pendingNav pattern**: progression sets `pendingNav = 'finder'`, App.svelte watches with `$effect`, switches tab, clears flag.

## Reactive Derived Chains

Components build derived state from singletons:

```typescript
// ProgressionBuilder.svelte
const isMobile = $derived(responsive.windowWidth < 768)
const sortedPool = $derived(
  [...pool.entries].sort((a, b) =>
    a.chordName.localeCompare(b.chordName) || (a.voicing.rank ?? 0) - (b.voicing.rank ?? 0)
  )
)
```

**Rule**: Derived values are read-only. Mutations go through singleton methods which call `persist()`.
