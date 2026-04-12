---
name: progression-builder
description: "ProgressionBuilder component for guitar-app (~2000 lines). USE FOR: modifying progression grid, drag-and-drop behavior, pool management, quick-add search, cell actions, PDF export, URL sharing, multi-select/sweep, mobile layout. Covers component state, two-column layout, two quick-add systems, grid cell rendering, drag system, selection modes."
---

# Progression Builder

[src/components/ProgressionBuilder.svelte](src/components/ProgressionBuilder.svelte) — the most complex component (~2000 lines). Manages a chord progression grid with pool sidebar, drag-and-drop, multi-select, PDF export, and URL sharing.

## Two-Column Layout

```
┌─────────────┬──────────────────────────────────┐
│ Pool Column │ Progression Column               │
│ (200px)     │                                  │
│             │ [Title input] [Select] [URL] [PDF]│
│ Quick Search│                                  │
│ [Nav btns]  │ ┌────┬────┬────┬────┐           │
│             │ │Cell│Cell│Cell│Cell│  ← 4 cols  │
│ Pool Entry  │ ├────┼────┼────┼────┤           │
│ Pool Entry  │ │Cell│Cell│Cell│Cell│           │
│ Pool Entry  │ └────┴────┴────┴────┘           │
│ ...         │ [+ Add Row]                      │
│             │                                  │
│ [Clear Pool]│                                  │
└─────────────┴──────────────────────────────────┘
```

- Desktop: pool is inline 200px sidebar
- Mobile (<768px): pool collapses into drawer overlay (`position: absolute`, z-index 20, toggle via `poolCollapsed`)

## Component State (15 groups)

| Group | Variables | Purpose |
|-------|-----------|---------|
| Global quick-add | `quickSearch`, `quickResults`, `quickDropdownOpen`, `quickAddingSymbol` | Pool column search |
| Cell quick-add | `cellQuickIdx`, `cellQuickSearch`, `cellQuickResults`, `cellPoolMatches`, `cellQuickOpen`, `cellQuickAdding` | Empty cell inline search |
| PDF export | `progressionGridEl`, `exporting` | Grid element ref, export flag |
| URL sharing | `urlCopied` | Clipboard feedback |
| Responsive | `isMobile` ($derived), `poolCollapsed` | Layout mode |
| Multi-select | `selectMode`, `selectedCells` (Set), `sweeping`, `swept`, `sweepStartIdx` | Sweep/select |
| Click-to-move | `moveFromIdx` | Highlighted source cell |
| Drag & drop | `dragSource`, `dragOverIdx`, `dragOverInsertIdx`, `dragOverZone` | Drag state |
| Pool mgmt | `sortedPool` ($derived), `clearPoolConfirm` | Sorted entries, clear confirmation |

## Two Quick-Add Systems

### 1. Global Quick-Add (Pool Column)

Search input at top of pool sidebar. Searches chord database.
- `updateQuickResults()`: filters to 8 results from `filterChords()`
- `handleQuickAdd()`: adds best voicing to pool only
- `handleQuickAddToProgression()`: adds to pool AND pushes to progression grid
- Shows top voicing diagram in dropdown

### 2. Cell-Level Quick-Add (Empty Cells)

When user clicks an empty cell, shows inline search with two sections:
- **"In pool" section**: pool entries matching search (can place directly)
- **"All chords" section**: chord database results (adds to pool + places in cell)
- Quick nav buttons to Finder and Identifier tabs
- Dropdown positioning: smart flip above/below, viewport edge clamping

## Grid Rendering

Grid columns: 4 (desktop) / 2 (mobile) / 6 (PDF export)

### Cell States

| Class | Appearance | When |
|-------|-----------|------|
| `.filled` | Solid border, chord diagram + name | Cell has poolKey |
| `.moving` | Accent border + glow shadow | `moveFromIdx === idx` |
| `.selected` | Accent border + light background | In `selectedCells` set |
| `.drag-over` | Accent highlight | Drag hovering over cell |

### Filled Cell Contents
- MiniChordDiagram (non-interactive)
- Chord name (with `displayAccidental`)
- Remove button (✕) — hidden in selectMode

### Empty Cell Contents
- If `cellQuickIdx === idx`: inline quick-add input + dropdown
- Else: "+" placeholder label

### Cell Action Buttons (hover-visible)
- Duplicate (⧉) — top-right corner
- Delete (−) — offset 18px left of duplicate
- Insert gutter (+) — right edge, circular button between cells during drag

## Drag & Drop

Full details: [drag-and-drop.md](./references/drag-and-drop.md)

**Summary**: Pool entries and filled cells are draggable. Drop targets: cells (swap/place), insert gutters (splice). Drag disabled on mobile.

## Multi-Select & Sweep

Full details: [drag-and-drop.md](./references/drag-and-drop.md#multi-select)

**Summary**: Toggle `selectMode`, sweep-select via pointer drag, batch delete/duplicate. Contiguity check enables duplicate.

## PDF Export

Full details: [pdf-export.md](./references/pdf-export.md)

**Summary**: Inline style overrides for html2canvas, 6-col grid, row-aware page breaks, jsPDF output.

## URL Sharing

`handleGenerateUrl()`:
1. Call `progression.toCompactUrl()` → compact string
2. Build URL: `${origin}${pathname}#p=${encodeURIComponent(compact)}`
3. Copy to clipboard
4. Show `urlCopied` feedback for 2s

## Cell Action Handlers

| Handler | Action |
|---------|--------|
| `handlePoolPush(key, idx)` | Place pool entry in cell |
| `handleReturnFromProgression(idx)` | Clear cell, show quick-add UI |
| `handleDeleteFromPool(key)` | Remove from pool AND all progression cells |
| `handleInsertCell(idx)` | Insert empty cell, shift right |
| `handleDeleteCell(idx)` | Delete cell, shift left |
| `handleDuplicateCell(idx)` | Copy cell after itself |
| `handleAddMoreCells()` | Add row (2 cols mobile, 4 desktop) |

## Pool Management

- `sortedPool`: $derived — sorts by `chordName` alphabetically, then by `voicing.rank`
- `clearPoolConfirm`: 2-click confirmation pattern (auto-resets after 3s)
- Clear returns all progression cells with poolKey back to empty first

## Keyboard

ESC key: cancels `moveFromIdx`, exits `selectMode`, clears selection
