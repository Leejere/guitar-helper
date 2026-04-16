---
name: layout
description: "Layout and responsive design system for guitar-app. USE FOR: adding responsive behavior, adjusting breakpoints, understanding mobile vs desktop layouts, fixing layout bugs, working with grid systems. Covers 4 CSS breakpoints, JS responsive state tracking, flex/grid strategies, padding system, mobile detection patterns."
---

# Layout & Responsive Design

## Overall Strategy

- **Flex column** main layout: `#app` is `display: flex; flex-direction: column`
- **Max width**: `1400px` with `margin: 0 auto` — content stays centered and constrained
- **Scrollbar extension**: scroll containers extend rightward via negative margin so scrollbars reach the viewport edge (see below)
- **Dual detection**: CSS `@media` queries for styling + JS `$derived` reactive state for conditional rendering
- **Central tracker**: [src/lib/responsive.svelte.ts](src/lib/responsive.svelte.ts) — singleton tracking `window.innerWidth`, updates on resize

## Scrollbar Extension Architecture

**Problem**: `#app { max-width: 1400px; margin: 0 auto }` centers content but pushes scrollbars inward from the viewport edge on wide screens.

**Solution**: Each scroll container extends rightward past `#app`'s boundary using negative margin + matching padding. The entire ancestor chain from `#app` down uses `overflow-y: clip; overflow-x: visible` so the extension isn't clipped.

### CSS Variable
```css
:root {
  --scroll-extend: max(0px, calc(50vw - 700px));
}
```
`700 = max-width / 2` (with `border-box`, `max-width: 1400px` includes the 24px left padding). On viewports ≤ 1400px, this evaluates to 0 — no extension, no effect.

### Extension Pattern (applied to every scroll container)
```css
.scroll-area {
  margin-right: calc(-1 * var(--scroll-extend));
  padding-right: var(--scroll-extend);  /* or calc(var(--scroll-extend) + Npx) if existing padding */
}
```

### Overflow Chain
Every ancestor between `#app` and the scroll container must use `overflow-y: clip; overflow-x: visible` (NOT `overflow: hidden`) so the rightward extension is visible:
```
#app (overflow-y: clip, overflow-x: visible)
 └─ .page-content (overflow-y: clip, overflow-x: visible)   [App.svelte]
     └─ .page-root (overflow-y: clip, overflow-x: visible)  [per component]
         └─ scroll-area (overflow-y: auto — the actual scroller)
```
`overflow-y: clip` + `overflow-x: visible` works because CSS spec allows `clip` to coexist with `visible` (unlike `hidden` + `visible` which forces both to `auto`). Supported: Chrome 90+, Firefox 81+, Safari 16+.

### Extended Scroll Containers
| Container | Component | Existing pad-right | Extension |
|---|---|---|---|
| `.home-page` | app.css | `0` | `var(--scroll-extend)` |
| `.scroll-area` | FretboardMap | `0` | `var(--scroll-extend)` |
| `.browse-scroll-area` | ChordFinder | `24px` | `calc(var(--scroll-extend) + 24px)` |
| `.voicings-scroll-area` | ChordFinder | `0` | `var(--scroll-extend)` |
| `.scroll-area` | ChordIdentifier | `0` | `var(--scroll-extend)` |
| `.explorer-scroll-area` | ShapeExplorer | `0` | `var(--scroll-extend)` |
| `.progression-grid` | ProgressionBuilder | `12px` | `calc(var(--scroll-extend) + 12px)` |

### Rules
1. **Never add `max-width` to a scroll container** — the extension compensates instead
2. **Never use `overflow: hidden` on the ancestor chain** — use `overflow-y: clip; overflow-x: visible`
3. **`.pool-column` keeps `overflow: hidden`** — it's a left sidebar, not in the extension path
4. **Tablet variants not extended** — viewport is ≤ 1354px where `--scroll-extend` = 0
5. **If `#app` max-width or padding-left changes**, recalculate the 700 constant in `--scroll-extend`

## Breakpoints

| Breakpoint | Type | Files | Purpose |
|------------|------|-------|---------|
| **768px** | CSS + JS | [app.css](src/app.css#L409), [FretboardMap](src/components/FretboardMap.svelte), [ChordIdentifier](src/components/ChordIdentifier.svelte), [ProgressionBuilder](src/components/ProgressionBuilder.svelte) | Primary mobile/desktop split |
| **767px** | CSS | [ProgressionBuilder](src/components/ProgressionBuilder.svelte) | Pool column → absolute overlay on mobile |
| **700px** | CSS | [ChordFinder](src/components/ChordFinder.svelte), [ShapeExplorer](src/components/ShapeExplorer.svelte) | Small phone: further grid/spacing reduction |
| **480px** | JS only | [ProgressionBuilder](src/components/ProgressionBuilder.svelte) | Narrow viewport: fixed dropdown positioning |

## JS Responsive State

```typescript
// src/lib/responsive.svelte.ts — singleton
responsive.windowWidth  // number, tracks window.innerWidth

// Derived states in components:
const isMobile = $derived(responsive.windowWidth < 768)          // ProgressionBuilder
const needsVertical = $derived(responsive.windowWidth < 1355)    // ChordFinder, ShapeExplorer
const isTablet = $derived(needsVertical && responsive.windowWidth >= 768)
```

**`needsVertical`** threshold: `FB_SVG_WIDTH + 60 ≈ 1355px` — when viewport is too narrow for horizontal fretboard, switches to vertical orientation.

## Desktop vs Mobile Layout

### Desktop (≥768px)
- Padding: `16px 0 0 24px` on `#app`, `24px` right on content
- Tab bar: horizontal, fixed
- Chord grid: `repeat(auto-fill, minmax(170px, 1fr))`, gap 16px
- Progression grid: `repeat(4, 1fr)`
- Fretboard: horizontal orientation
- Pool column: inline 200px sidebar

### Mobile (<768px)
- Padding: `10px 0 0 10px` on `#app`, `10px` right
- Tab bar: horizontal scroll with `-webkit-overflow-scrolling: touch`
- Chord grid: `repeat(auto-fill, minmax(130px, 1fr))`, gap 10px
- Progression grid: `repeat(2, 1fr)`
- Fretboard: vertical orientation
- Pool column: collapsible drawer, `position: absolute`, z-index 20
- Drag disabled (`draggable=false`)

### Small Phone (<700px)
- Chord grid: `repeat(auto-fill, minmax(110px, 1fr))`
- More aggressive padding/margin reduction

### Tablet (768px ≤ width < ~1355px)
- `isTablet = true`: side-by-side fretboard + detail pane with `gap: 24px`
- `.tablet` CSS class for variant layouts

## Grid Systems

### Chord Grid (auto-fill responsive)
```css
grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));  /* desktop */
grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));  /* mobile */
grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));  /* <700px */
```

### Progression Grid (fixed columns)
```css
grid-template-columns: repeat(4, 1fr);  /* desktop */
grid-template-columns: repeat(2, 1fr);  /* mobile */
grid-template-columns: repeat(6, 1fr);  /* PDF export mode */
```

### Home Page Grid
```css
grid-template-columns: repeat(2, 1fr); max-width: 640px;  /* desktop */
grid-template-columns: 1fr; max-width: 400px;              /* mobile */
```

## Padding Strategy

| Context | Desktop | Mobile |
|---------|---------|--------|
| `#app` container | `16px 0 0 24px` | `10px 0 0 10px` |
| Content right | `24px` | `10px` |
| Home page | `20px 0` + scroll-extend | `16px 0` |
| Grid gap (chords) | `16px` | `10px` |
| Grid gap (home) | `20px` | `20px` (unchanged) |

## Fretboard Layout

The fretboard SVG width is calculated as: `FB_SVG_WIDTH = 75 + (15+1)*75 + 20 = 1295px`

- **Horizontal**: default, used when viewport width > `FB_SVG_WIDTH + 60`
- **Vertical**: rotated 90°, used on narrow viewports (`needsVertical = true`)
- Container classes: `.fretboard-container`, `.mobile-vertical`, `.mobile-fretboard-layout`

## Print Layout

`@media print` in [src/app.css](src/app.css#L472):
- Hides tab bar, buttons, interactive controls via `.no-print`
- White background, adjusted colors for paper
- Special export mode for ProgressionBuilder uses 6-column grid with inline styles

## Key Patterns

1. **Use `responsive.windowWidth`** for JS-side responsive decisions, not `window.innerWidth` directly
2. **CSS breakpoints** for pure visual changes; **JS `$derived`** for conditional rendering (show/hide components)
3. **class:mobile={isMobile}** pattern to toggle CSS classes based on JS state
4. **Pool overlay on mobile**: position:absolute with box-shadow, toggled via `poolCollapsed` state
5. **Scroll containers extend right** via `margin-right: calc(-1 * var(--scroll-extend)); padding-right: ...` — never constrain scroll containers with `max-width`
6. **Ancestor overflow chain**: `overflow-y: clip; overflow-x: visible` from `#app` down to scroll container parent — never `overflow: hidden` on these ancestors
