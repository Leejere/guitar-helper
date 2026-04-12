# Guitar App — Workspace Instructions

## What This Is

A guitar learning and chord exploration SPA built with **Svelte 5** (runes), **Vite**, and **TypeScript**. Five tabs: Fretboard Map, Chord Finder, Chord Identifier, Shape Explorer, Progression Builder. No router library — tab state managed in App.svelte.

## Build & Run

```sh
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
npx vite build 2>&1 | tail -5   # verify build
npx vite dev                     # dev server
```

## Skills

Consult these before making changes in their domain. Each is in `.github/skills/<name>/SKILL.md`:

| Skill | When to consult |
|-------|----------------|
| **styling** | Colors, themes, CSS variables, component visual patterns |
| **layout** | Breakpoints, responsive behavior, grid systems, mobile vs desktop |
| **modules** | Finding where code lives, understanding component hierarchy and data flow |
| **state-management** | Adding/modifying reactive state, persistence, cross-component communication |
| **music-theory** | Chord database, voicing generation (DFS), scoring, CAGED shapes, barre detection |
| **progression-builder** | Progression grid, drag-and-drop, pool, quick-add, PDF export, URL sharing |
| **persistence** | localStorage keys, URL encoding/decoding, hydration flow |
| **cross-module-navigation** | Cross-tab navigation callbacks, voicing injection, index encoding, $effect ordering |

## Rules

1. **Follow existing patterns.** Read the relevant skill before adding code in that area. Match the conventions documented there.
2. **Keep skills current.** When you change a convention, pattern, or algorithm documented in a skill, update the skill file to match. Skills must always reflect the actual codebase.
3. **Svelte 5 runes only.** Use `$state()`, `$derived()`, `$effect()`, `$props()`. No Svelte 4 stores or reactive declarations.
4. **CSS variables for all colors.** Never hardcode hex/rgb in components — use `var(--name)` from `app.css`.
5. **Inline styles for html2canvas.** Any element captured by html2canvas for PDF export must use JS-applied inline styles, not scoped CSS.
6. **Singleton state pattern.** New state modules: class with `$state()` fields, `persist()`/`hydrate()` methods, exported singleton instance.
7. **Verify builds.** Run `npx vite build` after changes to confirm no errors.
