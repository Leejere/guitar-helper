<script lang="ts">
  import { Note, Interval } from 'tonal';
  import { displayAccidental } from '../lib/music';
  import { playStrum } from '../lib/audio';
  import type { Voicing } from '../lib/voicings';
  import type { Tuning } from '../lib/tunings';

  interface Props {
    voicing: Voicing;
    tuning: Tuning;
    chordName?: string;
  }

  let { voicing, tuning, chordName }: Props = $props();

  const stringCount = 6;
  const stringSpacing = 22;
  const fretSpacing = 32;
  const dotRadius = 9;
  const topPadding = 35;
  const bottomPadding = 15;
  const leftPadding = 15;
  const rightPadding = 15;

  // Compute display range
  let frettedFrets = $derived(voicing.frets.filter(f => f > 0));
  let minFret = $derived(frettedFrets.length > 0 ? Math.min(...frettedFrets) : 1);
  let maxFret = $derived(frettedFrets.length > 0 ? Math.max(...frettedFrets) : 4);
  let startFret = $derived(minFret <= 2 ? 1 : minFret);
  let displayFretCount = $derived(Math.max(4, maxFret - startFret + 2));
  let displayFrets = $derived(Array.from({ length: displayFretCount }, (_, i) => i + startFret));

  let svgWidth = $derived(leftPadding + (stringCount - 1) * stringSpacing + rightPadding);
  let svgHeight = $derived(topPadding + displayFrets.length * fretSpacing + bottomPadding);

  function stringX(stringIdx: number): number {
    // Display: string 0 (low E) on left, string 5 (high E) on right
    return leftPadding + stringIdx * stringSpacing;
  }

  function fretY(fretIdx: number): number {
    // fretIdx is relative to displayFrets
    return topPadding + fretIdx * fretSpacing;
  }

  function dotY(fret: number): number {
    const idx = fret - startFret;
    return topPadding + idx * fretSpacing + fretSpacing / 2;
  }

  function getNoteAt(stringIdx: number, fret: number): string {
    // Use the voicing's pre-respelled pitch classes for consistent enharmonic naming
    const openNote = tuning.notes[stringIdx];
    const rawNote = Note.transpose(openNote, Interval.fromSemitones(fret));
    // Find this string's index among sounding strings to look up respelled pitch class
    let soundingIdx = 0;
    for (let s = 0; s < stringIdx; s++) {
      if (voicing.frets[s] !== -1) soundingIdx++;
    }
    if (voicing.frets[stringIdx] !== -1 && voicing.frets[stringIdx] === fret && soundingIdx < voicing.pitchClasses.length) {
      // Use the voicing's respelled pitch class with the computed octave
      const pc = voicing.pitchClasses[soundingIdx];
      const origOctave = Note.octave(rawNote);
      if (origOctave !== undefined) {
        const origChroma = Note.chroma(Note.pitchClass(rawNote))!;
        const newChroma = Note.chroma(pc)!;
        let octave = origOctave;
        if (origChroma < 3 && newChroma >= 9) octave--;
        if (origChroma >= 9 && newChroma < 3) octave++;
        return pc + octave;
      }
      return pc;
    }
    return rawNote;
  }

  async function handlePlay() {
    await playStrum(voicing.notes);
  }

  let voicingStr = $derived(
    voicing.frets.map(f => f === -1 ? 'x' : f.toString()).join('')
  );
</script>

<div class="chord-card">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={svgWidth}
    height={svgHeight}
    viewBox="0 0 {svgWidth} {svgHeight}"
  >
    <!-- Background -->
    <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="var(--bg-card)" rx="4" />

    <!-- Nut or fret position indicator -->
    {#if startFret <= 1}
      <rect
        x={leftPadding - 3}
        y={topPadding - 3}
        width={(stringCount - 1) * stringSpacing + 6}
        height="6"
        fill="var(--nut-color)"
        rx="2"
      />
    {:else}
      <text
        x={leftPadding - 12}
        y={topPadding + fretSpacing / 2 + 4}
        text-anchor="middle"
        font-size="11"
        fill="var(--text-muted)"
        font-family="'Work Sans', system-ui, sans-serif"
      >{startFret}</text>
    {/if}

    <!-- Fret lines (horizontal) -->
    {#each displayFrets as _, idx}
      <line
        x1={leftPadding - 3}
        y1={fretY(idx)}
        x2={leftPadding + (stringCount - 1) * stringSpacing + 3}
        y2={fretY(idx)}
        stroke="var(--fret-color)"
        stroke-width="1.5"
        opacity="0.5"
      />
    {/each}
    <!-- Bottom fret line -->
    <line
      x1={leftPadding - 3}
      y1={fretY(displayFrets.length)}
      x2={leftPadding + (stringCount - 1) * stringSpacing + 3}
      y2={fretY(displayFrets.length)}
      stroke="var(--fret-color)"
      stroke-width="1.5"
      opacity="0.5"
    />

    <!-- Strings (vertical) -->
    {#each Array.from({ length: stringCount }, (_, i) => i) as stringIdx}
      {@const thickness = 1 + (stringCount - 1 - stringIdx) * 0.2}
      <line
        x1={stringX(stringIdx)}
        y1={topPadding}
        x2={stringX(stringIdx)}
        y2={fretY(displayFrets.length)}
        stroke="var(--string-color)"
        stroke-width={thickness}
        opacity="0.7"
      />
    {/each}

    <!-- Muted/Open string indicators at top -->
    {#each voicing.frets as fret, stringIdx}
      {#if fret === -1}
        <text
          x={stringX(stringIdx)}
          y={topPadding - 12}
          text-anchor="middle"
          font-size="14"
          fill="var(--text-muted)"
          font-family="'Work Sans', system-ui, sans-serif"
          font-weight="600"
        >x</text>
      {:else if fret === 0}
        <circle
          cx={stringX(stringIdx)}
          cy={topPadding - 15}
          r="6"
          fill="none"
          stroke="var(--text-muted)"
          stroke-width="1.5"
        />
      {/if}
    {/each}

    <!-- Barre indicators -->
    {#each voicing.barres as barre}
      {@const fromX = stringX(barre.fromString)}
      {@const toX = stringX(barre.toString)}
      {@const y = dotY(barre.fret)}
      <rect
        x={fromX - dotRadius}
        y={y - dotRadius}
        width={toX - fromX + dotRadius * 2}
        height={dotRadius * 2}
        rx={dotRadius}
        fill="var(--dot-bg)"
        opacity="0.8"
      />
    {/each}

    <!-- Fretted note dots -->
    {#each voicing.frets as fret, stringIdx}
      {#if fret > 0}
        {@const isRoot = voicing.pitchClasses.length > 0 && Note.pitchClass(getNoteAt(stringIdx, fret)) === voicing.pitchClasses[0]}
        <circle
          cx={stringX(stringIdx)}
          cy={dotY(fret)}
          r={dotRadius}
          fill={isRoot ? 'var(--root-bg)' : 'var(--dot-bg)'}
        />
        <text
          x={stringX(stringIdx)}
          y={dotY(fret) + 3.5}
          text-anchor="middle"
          font-size="9"
          fill="#fff"
          font-family="'Work Sans', system-ui, sans-serif"
          font-weight="700"
        >{displayAccidental(Note.pitchClass(getNoteAt(stringIdx, fret)))}</text>
      {/if}
    {/each}
  </svg>

  <div class="voicing-label">{voicingStr}</div>

  <button class="btn btn-small btn-secondary" onclick={handlePlay} style="margin-top: 6px;">
    &#9654; Play
  </button>
</div>

<style>
  .chord-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .voicing-label {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 6px;
    font-family: monospace;
    letter-spacing: 1px;
  }

  svg {
    display: block;
  }
</style>
