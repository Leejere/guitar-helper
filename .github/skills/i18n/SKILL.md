# i18n Skill

Internationalization system for guitar-app. Path-based locale with reactive Svelte 5 singleton.

## Architecture

- **Locale detection**: pathname contains `/cn/` → `'cn'`, else `'en'`
- **Locale switch**: full page reload via `window.location.href` (changes path segment)
- **SPA fallback**: deploy step copies `dist/index.html` → `dist/cn/index.html`
- **Base path**: `import.meta.env.BASE_URL` (Vite) — `/guitar-helper/`

## Files

| File | Purpose |
|------|---------|
| `src/lib/i18n.svelte.ts` | Singleton `I18n` class, exports `i18n`, `t()`, `tc()`, `tMode()`, `tCategory()`, `tRelation()`, `tTuning()`, `tShapeLabel()`, `tShapeName()`, `tPosition()`, `tTypeName()`, `tFunctionName()` |
| `src/lib/translations/en.ts` | English translation map |
| `src/lib/translations/cn.ts` | Chinese translation map |

## Translation Functions

| Function | Usage | Example |
|----------|-------|---------|
| `t(key, ...args)` | Simple string with `{0}`, `{1}` interpolation | `t('common.fretN', 5)` → `"Fret 5"` |
| `tc(key, count)` | Count-aware; translation uses `singular \| plural` format | `tc('count.chord', 3)` → `"3 chords"` |
| `tMode(mode)` | Converts scale mode name to camelCase key under `mode.*` | `tMode('harmonic minor')` → `"和声小调"` |
| `tCategory(cat)` | Chord category name → `cat.*` key | `tCategory('Diminished')` → `"减和弦"` |
| `tRelation(label)` | Chord relation label → `rel.*` key | `tRelation('m7')` → `"小七"` |
| `tTuning(name)` | Tuning name → `tuning.*` key | `tTuning('Drop D')` → `"降D"` |
| `tShapeLabel(label)` | Full CAGED shape label; parses "X shape" / "X shape var." | `tShapeLabel('Dim shape')` → `"减指型"` |
| `tShapeName(name)` | Shape family name prefix only | `tShapeName('Dim')` → `"减"` |
| `tPosition(group)` | Position group string → translated | `tPosition('Fret 3')` → `"第3品"` |
| `tTypeName(name)` | Chord type name from tonal → `type.*` key | `tTypeName('diminished seventh')` → `"减七和弦"` |
| `tFunctionName(name)` | Scale degree function → `func.*` key | `tFunctionName('Dominant')` → `"属音"` |

## Key Conventions

- Keys are dot-namespaced by component: `finder.*`, `identifier.*`, `prog.*`, `shapes.*`, `diagram.*`, `fretboard.*`, `common.*`, `app.*`, `tabs.*`, `tiles.*.*`, `count.*`, `mode.*`, `cat.*`, `rel.*`, `tuning.*`, `type.*`, `func.*`, `shapes.name.*`
- Plural format: `"singular text | plural text"` — `tc()` picks left half when count === 1, right half otherwise
- Interpolation: `{0}`, `{1}` positional placeholders
- Music note names (C, D♯, etc.) stay in English (from tonal library) — only UI chrome is translated
- Chord type suffixes in chord symbols (maj7, m, dim, etc.) stay in English — but descriptive type names are translated via `tTypeName()`
- Data modules (voicings.ts, chords.ts) generate English labels; translation happens at display time via helper functions

## Adding a New String

1. Add key + English value to `src/lib/translations/en.ts`
2. Add same key + translated value to `src/lib/translations/cn.ts`
3. Import `t` (or `tc`, `tMode`) from `'../lib/i18n.svelte'` in the component
4. Replace hardcoded string with `t('key')` or `t('key', arg)`

## Adding a New Language

1. Create `src/lib/translations/<code>.ts` exporting `Record<string, string>` with same keys
2. Add `<code>` to the `Locale` type union in `i18n.svelte.ts`
3. Import and add to the `translations` object in `i18n.svelte.ts`
4. Add font family if needed (Google Fonts in `index.html`, font-family in `app.css`)
5. Add deploy step: `mkdir -p dist/<code> && cp dist/index.html dist/<code>/index.html`
6. Update locale detection regex in constructor

## Font Strategy

- **English**: Work Sans (400/500/600/700)
- **Chinese**: Noto Sans SC (400/500/600/700)
- Both loaded via Google Fonts in `index.html`
- Font stack: `'Work Sans', 'Noto Sans SC', system-ui, -apple-system, sans-serif`

## Locale Toggle

- Dual-label toggle in header: `EN | 中文` with active state highlighting
- Active language gets `font-weight: 600` and full text color; inactive is dimmed
- CSS classes: `.locale-toggle`, `.locale-toggle span.active`, `.locale-sep`
- Triggers `i18n.setLocale()` which updates `$state` locale in-place (no page reload)
- URL is updated via `history.replaceState` to keep `/cn/` path in sync
- All templates re-render reactively because `t()` reads `i18n.locale` (`$state`)
