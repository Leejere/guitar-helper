---
name: styling
description: "CSS styling system for guitar-app. USE FOR: adding new UI elements, changing colors/themes, understanding visual conventions, fixing styling bugs, adding dark/light/print mode support. Covers CSS custom properties, scoped Svelte styles, global app.css structure, naming conventions, component patterns (buttons, cards, forms, tags), font stack, transitions, SVG coloring via CSS vars."
---

# Styling System

## Architecture

- **Plain CSS** with CSS custom properties (variables) — no SCSS, CSS modules, or CSS-in-JS
- **Scoped component styles** in Svelte `<style>` blocks (Svelte auto-scopes class selectors)
- **Single global stylesheet**: [src/app.css](src/app.css) (~525 lines), imported in [src/main.ts](src/main.ts)
- **Font**: `'Work Sans'` from Google Fonts, fallback `system-ui, -apple-system, sans-serif` — loaded in [index.html](index.html)

## CSS Custom Properties

All variables defined on `:root` in [src/app.css](src/app.css). Dark theme is default; light/print override via media queries.

### Dark Theme (Default)

**Backgrounds & Surfaces:**
| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | `#000000` | Main background |
| `--bg-secondary` | `#0d0d0d` | Secondary background |
| `--bg-card` | `#161616` | Card/surface background |
| `--border` | `#262626` | Border color |

**Text:**
| Variable | Value | Usage |
|----------|-------|-------|
| `--text` | `#e8e8e8` | Primary text |
| `--text-muted` | `#808080` | Muted/disabled text |

**Accents & Status:**
| Variable | Value | Usage |
|----------|-------|-------|
| `--accent` | `#d4874d` | Primary accent (warm orange) |
| `--accent-hover` | `#e09960` | Accent hover state |
| `--error` | `#d44040` | Error (red) |
| `--success` | `#5a9a5a` | Success (green) |
| `--highlight` | `#d4874d` | Highlight (same as accent) |

**Fretboard-Specific:**
| Variable | Value | Usage |
|----------|-------|-------|
| `--fretboard-bg` | `#2c1810` | Fretboard background (dark brown) |
| `--fret-color` | `#a0a0a0` | Fret lines (gray) |
| `--string-color` | `#d4a574` | Guitar strings (tan) |
| `--dot-bg` | `#d4874d` | Finger dot background |
| `--dot-text` | `#000000` | Finger dot text |
| `--root-bg` | `#cc4444` | Root note (red) |
| `--nut-color` | `#f5f0e8` | Guitar nut (cream) |

**Overlays (Transparency):**
| Variable | Value |
|----------|-------|
| `--overlay-faint` | `rgba(255,255,255,0.06)` |
| `--overlay-subtle` | `rgba(255,255,255,0.15)` |
| `--overlay-medium` | `rgba(255,255,255,0.5)` |

**Tag Colors (Shape/Type Indicators):**
Each tag has 3 vars: color, background, border.

| Tag | Color | Usage |
|-----|-------|-------|
| `--tag-caged` / `-bg` / `-border` | `#6bb3a0` (teal) | CAGED shape tags |
| `--tag-pos` / `-bg` / `-border` | `#d4874d` (orange) | Position tags |
| `--tag-barre` / `-bg` / `-border` | `#b89aaa` (mauve) | Barre tags |
| `--tag-other` / `-bg` / `-border` | `#a0a090` (tan-gray) | Other tags |

### Light Theme

Activated via `@media (prefers-color-scheme: light)` in [src/app.css](src/app.css#L370).
No manual toggle — follows OS/browser preference.
All variables redefined with warm browns for accents, lighter backgrounds (e.g., `--fretboard-bg: #e8d5b7`).

### Print Theme

`@media print` overrides in [src/app.css](src/app.css#L472):
- White background, black text
- Simplified palette
- `.no-print` class hides interactive elements

## Class Naming Conventions

**BEM-like (simplified, no `__` or `--` modifiers):**
- Base: `.btn`, `.chord-grid`, `.chord-card`, `.control-group`, `.tab-bar`
- Variants: `.btn-primary`, `.btn-secondary`, `.btn-small`
- State: `.active`, `.disabled`, `.in-pool`, `.filled`, `.moving`, `.selected`
- Responsive: `.tablet`, `.mobile-*`
- Utility: `.page-root`, `.scroll-area`, `.no-print`

## Common Patterns

### Buttons
```css
.btn {
  padding: 8px 16px;
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
```

### Cards
```css
.chord-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}
```

### Form Controls
```css
select, input[type="text"] {
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 16px; /* minimum 16px — prevents iOS Safari auto-zoom on focus */
}
```

### Transitions
- Standard: `transition: all 0.2s` or `transition: color 0.15s`
- Used for hover effects and state changes

### SVG Coloring
Fretboard and chord diagrams use CSS variables directly in SVG attributes:
```svelte
<line stroke="var(--fret-color)" />
<circle fill="var(--dot-bg)" />
```

## Global CSS Structure ([src/app.css](src/app.css))

| Lines | Section |
|-------|---------|
| 1-36 | `:root` CSS variables (dark theme) |
| 38-58 | Custom CSS reset (box-sizing, margin, font) |
| 60-370 | Global element styles, buttons, controls, containers, grids |
| 370-407 | `@media (prefers-color-scheme: light)` overrides |
| 409-470 | `@media (max-width: 768px)` responsive |
| 472-525 | `@media print` overrides |

## Key Rules

1. **Always use CSS variables** for colors — never hardcode hex values in components
2. **Scoped styles** in Svelte `<style>` — global styles only in `app.css`
3. **html2canvas compatibility**: For elements captured by html2canvas (PDF export), use **inline styles** set via JS — html2canvas doesn't reliably read scoped Svelte CSS
4. **Border-radius**: 6px for controls, 8px for cards
5. **Font-weight**: 600 for buttons/headings, 400 for body text
6. **Fixed-width toggle buttons**: Any button whose label changes between states (e.g., "+ Add to pool" / "− Delete from pool") must have `min-width` set to accommodate the longest label, plus `justify-content: center`. This prevents layout shift when the text toggles. Example: `.voicing-action-btn { min-width: 105px; justify-content: center; }`
