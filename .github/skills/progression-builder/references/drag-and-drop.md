# Drag & Drop System

Deep dive into drag-and-drop in [ProgressionBuilder.svelte](../../src/components/ProgressionBuilder.svelte).

## Drag State

```typescript
let dragSource = $state<{
  type: 'pool' | 'progression'
  key?: string       // poolEntry.key (pool drag) or cell.poolKey (cell drag)
  idx?: number       // cell index (progression drag only)
} | null>(null)

let dragOverIdx = $state<number | null>(null)          // cell being hovered
let dragOverInsertIdx = $state<number | null>(null)    // insert gutter being hovered
let dragOverZone = $state<string | null>(null)         // 'progression' or null
```

The grid element gets `class:dragging={!!dragSource}` to enable visual changes during drag.

## Pool → Cell Drag

1. **Start**: `handlePoolDragStart(e, entry)` — sets `dragSource = { type: 'pool', key: entry.key }`
2. **Over cell**: `handleCellDragOver(e, idx)` — sets `dragOverIdx`
3. **Drop on empty cell**: `pushToCell(key, idx)` — places voicing
4. **Drop on filled cell**: no-op (can't replace occupied cell from pool)
5. **End**: `handleDragEnd()` — clears all drag state

Pool entries have `draggable={!isMobile}` — drag disabled on mobile.

## Cell → Cell Drag

1. **Start**: `handleCellDragStart(e, cell, idx)` — only if cell has `poolKey`
2. **Drop on filled cell**: `swapCells(fromIdx, toIdx)` — exchange contents
3. **Drop on empty cell**: `relocateCell(fromIdx, toIdx)` — move (deletes from original position, inserts at target)

## Insert Gutter System

Between each pair of adjacent cells, there's an invisible insert button (`+`):

```svelte
<button class="cell-insert-btn"
  class:insert-drag-over={dragOverInsertIdx === idx + 1}
  ondragover={(e) => handleInsertDragOver(e, idx + 1)}
  ondragleave={handleInsertDragLeave}
  ondrop={(e) => handleInsertDrop(e, idx + 1)}>
  +
</button>
```

### Handlers

- `handleInsertDragOver(e, insertIdx)`: Sets `dragOverInsertIdx = insertIdx`, clears `dragOverIdx`
- `handleInsertDragLeave()`: Clears `dragOverInsertIdx`
- `handleInsertDrop(e, insertIdx)`:
  - **Progression → Progression**: `relocateCell(fromIdx, insertIdx)` — splice out from original, insert before target (adjusts index if source was before target)
  - **Pool → Progression**: `insertCellAt(insertIdx)` then `pushToCell(key, insertIdx)`

### CSS Behavior

- Base: 16×16px circle, opacity: 0, positioned right edge of cell
- During drag (`.progression-grid.dragging`): becomes visible with accent color
- On hover (`.insert-drag-over`): fills solid accent with white text

## Click-to-Move (Mobile Alternative)

Since drag is disabled on mobile, click-to-move provides the same functionality:

1. Click filled cell → sets `moveFromIdx = idx` (cell shows `.moving` highlight)
2. Click another cell:
   - Both filled → `swapCells(moveFromIdx, targetIdx)`
   - Source filled, target empty → `moveToEmpty(moveFromIdx, targetIdx)`
   - Source empty, target filled → `moveToEmpty(targetIdx, moveFromIdx)`
3. Click same cell again → cancels (`moveFromIdx = null`)
4. ESC → cancels

## Multi-Select & Sweep {#multi-select}

### Selection Mode

Toggle via `selectMode` button. When active:
- `touch-action: none` on cells (prevents scroll during sweep)
- Click toggles cell in `selectedCells` Set
- Drag disabled

### Sweep Selection

Pointer-based drag selection across cells:

1. `startSweep(idx)` — on `pointerdown`:
   - Records `sweepStartIdx = idx`
   - Sets `sweeping = true`, `swept = false`
   - Does NOT add cell yet (waits for movement)
2. `sweepOver(idx)` — on `pointermove`:
   - If `sweeping` and entered new cell:
     - First move: retroactively selects `sweepStartIdx` cell
     - Adds current cell to `selectedCells`
     - Sets `swept = true`
3. `endSweep()` — on `pointerup` / `pointerleave`:
   - Sets `sweeping = false`

The `sweepStartIdx` fix ensures the first cell is selected when the user starts dragging (without it, the starting cell was missed).

### Batch Operations

| Operation | Condition | Method |
|-----------|-----------|--------|
| Delete selected | Any selection | `progression.deleteSelection(indices)` — removes cells, shifts left |
| Duplicate selected | Selection is contiguous | `progression.duplicateSelection(indices)` — copies before first index |

**Contiguity check**: `selectionContiguous` derived — sorted indices form an unbroken range.
