---
name: modules
description: "Module map and architecture for guitar-app. USE FOR: understanding project structure, finding where code lives, tracing data flow, adding new features, understanding component hierarchy. Covers entry points, 5 page components, 4 shared UI components, 6 music theory modules, 8 state singletons, external dependencies."
---

# Module Map & Architecture

## Entry Points

```
index.html          → Loads Google Fonts (Work Sans), mounts #app div
  └── src/main.ts   → Imports app.css, mounts App.svelte to DOM
      └── src/App.svelte → Tab router, URL hydration, cross-tab navigation
```

## Component Hierarchy

```
App.svelte (tab router)
├── Home Page (tile navigation grid)
└── Active Tab (one of):
    ├── FretboardMap.svelte
    │   └── Fretboard.svelte (display: notes/intervals)
    │
    ├── ChordFinder.svelte
    │   ├── ButtonFilter.svelte (×5: roots, keys, categories, voicings, scale)
    │   ├── Fretboard.svelte (browseable voicings)
    │   ├── MiniChordDiagram.svelte (result grid)
    │   └── ChordDiagram.svelte (large detail view)
    │
    ├── ChordIdentifier.svelte
    │   ├── Fretboard.svelte (interactive fret selection)
    │   └── ChordDiagram.svelte (identified chord display)
    │
    ├── ShapeExplorer.svelte
    │   ├── ButtonFilter.svelte (shape, variant filters)
    │   ├── Fretboard.svelte (shape visualization)
    │   ├── MiniChordDiagram.svelte (variant results)
    │   └── ChordDiagram.svelte (shape details)
    │
    └── ProgressionBuilder.svelte
        ├── MiniChordDiagram.svelte (grid cells)
        └── ChordDiagram.svelte (selected cell detail)

Toast (global, rendered at App level)
```

## Page Components

| Component | File | Purpose | Key Features |
|-----------|------|---------|-------------|
| FretboardMap | [src/components/FretboardMap.svelte](src/components/FretboardMap.svelte) | Fretboard visualization | Notes/intervals display, PDF export |
| ChordFinder | [src/components/ChordFinder.svelte](src/components/ChordFinder.svelte) | Browse & voice chords | 6-filter pipeline, voicing detail, pool/progression integration |
| ChordIdentifier | [src/components/ChordIdentifier.svelte](src/components/ChordIdentifier.svelte) | Tap frets to ID chords | Interactive fretboard, audio playback |
| ShapeExplorer | [src/components/ShapeExplorer.svelte](src/components/ShapeExplorer.svelte) | CAGED shape browser | Shape/variant filters, position visualization |
| ProgressionBuilder | [src/components/ProgressionBuilder.svelte](src/components/ProgressionBuilder.svelte) | Chord progression editor | Grid editor, pool, drag-drop, PDF export, URL sharing |

## Shared UI Components

| Component | File | Purpose | Complexity |
|-----------|------|---------|-----------|
| Fretboard | [src/components/Fretboard.svelte](src/components/Fretboard.svelte) | Interactive/display fretboard SVG | High — multiple display modes, enharmonic respelling, vertical/horizontal |
| ChordDiagram | [src/components/ChordDiagram.svelte](src/components/ChordDiagram.svelte) | Large chord diagram with controls | Medium — auto-fit range, play/pool/progression buttons |
| MiniChordDiagram | [src/components/MiniChordDiagram.svelte](src/components/MiniChordDiagram.svelte) | Compact chord diagram | Low — fixed small dimensions |
| ButtonFilter | [src/components/ButtonFilter.svelte](src/components/ButtonFilter.svelte) | Multi-select toggle filter | Low — reusable filter control |

## Music Theory & Data Modules (Pure TypeScript)

| Module | File | Key Exports |
|--------|------|------------|
| Tunings | [src/lib/tunings.ts](src/lib/tunings.ts) | `Tuning`, `STANDARD`, `DROP_D`, `ALL_TUNINGS` |
| Music Utils | [src/lib/music.ts](src/lib/music.ts) | `getChord()`, `fretsToVoicing()`, `identifyChords()`, `displayAccidental()`, `getIntervalLabel()`, `ALL_ROOTS` |
| Chord Database | [src/lib/chords.ts](src/lib/chords.ts) | `filterChords()`, `getChordDatabase()`, `ALL_CATEGORIES`, `FILTER_ROOTS`, `SCALE_MODES` |
| Voicings | [src/lib/voicings.ts](src/lib/voicings.ts) | `findVoicings()`, `getShapeVoicingsAtPosition()`, `detectBarres()`, `classifyCAGED()`, `SHAPE_CONFIGS` |
| Audio | [src/lib/audio.ts](src/lib/audio.ts) | `playChord()`, `playStrum()` — PolySynth with triangle wave |
| PDF Export | [src/lib/pdf.ts](src/lib/pdf.ts) | `exportFretboardPdf()` — jsPDF + svg2pdf |

## State Modules (Svelte 5 Runes)

| Module | File | Singleton | Storage Key |
|--------|------|-----------|------------|
| Pool | [src/lib/pool.svelte.ts](src/lib/pool.svelte.ts) | `pool` | `guitar-app-pool` |
| Progression | [src/lib/progression.svelte.ts](src/lib/progression.svelte.ts) | `progression` | `guitar-app-progression` |
| Chord Finder | [src/lib/chord-finder-state.svelte.ts](src/lib/chord-finder-state.svelte.ts) | `chordFinderState` | `guitar-app-chord-finder` |
| Identifier | [src/lib/identifier-state.svelte.ts](src/lib/identifier-state.svelte.ts) | `identifierState` | `guitar-app-identifier` |
| Fretboard Map | [src/lib/fretboard-map-state.svelte.ts](src/lib/fretboard-map-state.svelte.ts) | `fretboardMapState` | `guitar-app-fretboard-map` |
| Shape Explorer | [src/lib/shape-explorer-state.svelte.ts](src/lib/shape-explorer-state.svelte.ts) | `shapeExplorerState` | `guitar-app-shape-explorer` |
| Toast | [src/lib/toast.svelte.ts](src/lib/toast.svelte.ts) | `toast` | N/A (transient) |
| Responsive | [src/lib/responsive.svelte.ts](src/lib/responsive.svelte.ts) | `responsive` | N/A (transient) |

## External Dependencies

| Package | Used By | Purpose |
|---------|---------|---------|
| `svelte` | Everything | Framework & runes |
| `tonal` | music.ts, chords.ts, voicings.ts | Music theory (chords, scales, intervals) |
| `tone.js` | audio.ts | Web Audio synthesis (PolySynth) |
| `jspdf` | pdf.ts, ProgressionBuilder | PDF generation |
| `svg2pdf.js` | pdf.ts | SVG → PDF conversion |
| `html2canvas` | ProgressionBuilder | DOM → canvas screenshot for progression PDF |

## Data Flow

```
Pure Music Theory (stateless):
  tunings.ts → music.ts → chords.ts → voicings.ts
              ↑ uses tonal library throughout

State Singletons (reactive, auto-persist):
  pool.svelte.ts ←→ progression.svelte.ts (share poolKeys)
  *-state.svelte.ts (each page has its own filter/UI state)

UI Layer (reads state, emits events):
  Page components read from singletons + call mutation methods
  Cross-tab navigation via callback props (onNavigateToFinder, etc.)
  App.svelte watches progression.pendingNav for tab switches
```

## Tab Routing

No router library. [App.svelte](src/App.svelte) manages `activeTab` state:
- Values: `'home' | 'map' | 'finder' | 'identifier' | 'shapes' | 'progression'`
- Tab bar renders buttons with `onclick` handlers
- Conditional rendering: `{#if activeTab === 'finder'}...{/if}`
- Cross-tab nav: callback props + `pendingNav` reactive field on progression
