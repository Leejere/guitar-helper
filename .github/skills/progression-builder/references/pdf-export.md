# PDF Export & URL Sharing

Detailed reference for export features in [ProgressionBuilder.svelte](../../src/components/ProgressionBuilder.svelte).

## PDF Export Flow

### Why Inline Styles?

`html2canvas` does not reliably read Svelte's scoped CSS. All export-time style changes must be applied as **inline JS styles** on DOM elements, then restored after capture.

### Export Process

1. **Prepare DOM** — add "exporting" class + inline style overrides:
   - Grid: `overflow: visible`, `height: auto`, `grid-template-columns: repeat(6, 1fr)`
   - Action buttons: `display: none` (hide ✕, ⧉, −, + buttons)
   - Cell borders: removed (cleaner PDF look)
   - Empty trailing cells: `display: none` (hide unfilled cells at end)
   - Row separator lines: inject `1px solid #ccc` bottom borders between rows

2. **Capture** — `html2canvas(progressionGridEl, { backgroundColor: '#fff', scale: 2 })`

3. **Restore DOM** — revert all inline styles to original values

4. **Generate PDF** — `jsPDF` with pagination:
   - **Title section**: First page gets progression title
   - **Row-aware page breaks**: Calculates row height in pixels, snaps `drawH` to complete row boundaries so rows are never split across pages
   - **Clip regions**: Source canvas regions are clipped precisely to avoid edge artifacts
   - **Footer**: "Guitar Helper" text on each page
   - **Filename**: Sanitized title (strips non-alphanumeric), e.g., `"My Song"` → `My_Song_progression.pdf`

### Key Variables

```typescript
let progressionGridEl: HTMLDivElement  // bind:this on grid container
let exporting = $state(false)          // prevents UI interaction during export
```

### Row Height Calculation

```
cellsPerRow = 6  (export mode)
totalRows = ceil(filledCellCount / cellsPerRow)
rowHeightPx = canvasHeight / totalRows
rowHeightPt = rowHeightPx * (pageWidth / canvasWidth)
```

Pages are filled row by row. When remaining page height < one row, start a new page.

## URL Sharing

### Generation — `handleGenerateUrl()`

```typescript
const compact = progression.toCompactUrl()
const url = `${location.origin}${location.pathname}#p=${encodeURIComponent(compact)}`
navigator.clipboard.writeText(url)
urlCopied = true
setTimeout(() => urlCopied = false, 2000)
```

### Compact URL Format

Pattern: `title|chords|cells`

**Title**: URL-encoded progression title string.

**Chords**: Comma-separated chord entries. Each: `chordName.fretString`
- `chordName`: e.g., `"C"`, `"Am"`, `"G7"`
- `fretString`: Each fret as single hex char (`0-9`, `a-f`), `x` for muted (-1)
- Example: `Am.x02210` = Am chord with frets [-1, 0, 2, 2, 1, 0]

**Cells**: Base36-encoded index sequence (no separators)
- Each char is an index into the chords array: `0-9` then `a-z` (supports up to 36 unique chords)
- `_` represents empty cell
- Trailing empty cells are trimmed
- Example: `01_1` = [chord0, chord1, empty, chord1]

### Full Example

```
My%20Song|C.x32010,Am.x02210,G.320003|01_1020_
```

Decodes to:
- Title: "My Song"
- Chords: C (x32010), Am (x02210), G (320003)
- Cells: [C, Am, empty, Am, C, Am, C, empty]

### Hydration (in App.svelte)

1. Match URL hash `#p=(.+)`
2. `decodeURIComponent()` → `ProgressionState.fromCompactUrl(decoded)`
3. For each parsed chord: `fretsToVoicing()` → `pool.add()` → collect pool keys
4. Map cell indices to pool keys
5. `progression.loadFromSnapshot({ title, poolEntries: [], cells: cellKeys })`
6. `history.replaceState()` to clean URL
7. Set `activeTab = 'progression'`

### Legacy URL Support

Pattern: `#progression=base64json`
- Base64 → URI decode → JSON with `{ title, poolEntries, cells }`
- Handled in App.svelte after compact format check fails
- Supports `findByLegacyKey()` for old pool key migration (frets-only keys → frets+chordName keys)
