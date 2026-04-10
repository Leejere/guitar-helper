# Guitar Helper

A browser-based guitar reference tool for exploring fretboard notes, finding chord voicings, identifying chords, and learning CAGED shapes.

**[Live App](https://leejere.github.io/guitar-helper/)**

## Features

- **Fretboard Map** — Visualize notes and intervals across the entire fretboard for any key and scale. Supports multiple tunings and PDF export.
- **Chord Finder** — Browse chords by root and quality, view all voicings with fret diagrams, filter by position and CAGED shape.
- **Chord Identifier** — Tap fret positions on an interactive fretboard to identify what chord you're playing.
- **Shape Explorer** — Explore the CAGED system: see how chord shapes move across the fretboard at every position.

## Tech Stack

- [Svelte 5](https://svelte.dev/) with TypeScript
- [Vite](https://vite.dev/)
- [Tonal.js](https://github.com/tonaljs/tonal) for music theory
- [Tone.js](https://tonejs.github.io/) for audio playback

## Development

```bash
npm install
npm run dev
```

## License

MIT

**Why enable `allowJs` in the TS template?**

While `allowJs: false` would indeed prevent the use of `.js` files in the project, it does not prevent the use of JavaScript syntax in `.svelte` files. In addition, it would force `checkJs: false`, bringing the worst of both worlds: not being able to guarantee the entire codebase is TypeScript, and also having worse typechecking for the existing JavaScript. In addition, there are valid use cases in which a mixed codebase may be relevant.

**Why is HMR not preserving my local component state?**

HMR state preservation comes with a number of gotchas! It has been disabled by default in both `svelte-hmr` and `@sveltejs/vite-plugin-svelte` due to its often surprising behavior. You can read the details [here](https://github.com/rixo/svelte-hmr#svelte-hmr).

If you have state that's important to retain within a component, consider creating an external store which would not be replaced by HMR.

```ts
// store.ts
// An extremely simple external store
import { writable } from 'svelte/store'
export default writable(0)
```
