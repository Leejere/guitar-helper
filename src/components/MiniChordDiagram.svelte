<script lang="ts">
  import { Note, Interval } from 'tonal';
  import { displayAccidental } from '../lib/music';
  import type { Voicing } from '../lib/voicings';
  import type { Tuning } from '../lib/tunings';

  interface Props {
    voicing: Voicing;
    tuning: Tuning;
  }

  let { voicing, tuning }: Props = $props();

  const stringCount = 6;
  const stringSpacing = 8;
  const fretSpacing = 12;
  const dotRadius = 3;
  const topPadding = 10;
  const bottomPadding = 4;
  const leftPadding = 6;
  const rightPadding = 6;

  let frettedFrets = $derived(voicing.frets.filter(f => f > 0));
  let minFret = $derived(frettedFrets.length > 0 ? Math.min(...frettedFrets) : 1);
  let startFret = $derived(minFret <= 2 ? 1 : minFret);
  let displayFretCount = 4;
  let displayFrets = $derived(Array.from({ length: displayFretCount }, (_, i) => i + startFret));

  let svgWidth = $derived(leftPadding + (stringCount - 1) * stringSpacing + rightPadding);
  let svgHeight = $derived(topPadding + displayFrets.length * fretSpacing + bottomPadding);

  function stringX(stringIdx: number): number {
    return leftPadding + stringIdx * stringSpacing;
  }

  function fretY(fretIdx: number): number {
    return topPadding + fretIdx * fretSpacing;
  }

  function dotY(fret: number): number {
    const idx = fret - startFret;
    return topPadding + idx * fretSpacing + fretSpacing / 2;
  }
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={svgWidth}
  height={svgHeight}
  viewBox="0 0 {svgWidth} {svgHeight}"
  class="mini-chord-svg"
>
  <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="transparent" />

  {#if startFret <= 1}
    <rect
      x={leftPadding - 1}
      y={topPadding - 2}
      width={(stringCount - 1) * stringSpacing + 2}
      height="3"
      fill="var(--nut-color)"
      rx="1"
    />
  {:else}
    <text
      x={leftPadding - 4}
      y={topPadding + fretSpacing / 2 + 3}
      text-anchor="middle"
      font-size="6"
      fill="var(--text-muted)"
      font-family="'Work Sans', system-ui, sans-serif"
    >{startFret}</text>
  {/if}

  <!-- Fret lines -->
  {#each displayFrets as _, idx}
    <line
      x1={leftPadding - 1}
      y1={fretY(idx)}
      x2={leftPadding + (stringCount - 1) * stringSpacing + 1}
      y2={fretY(idx)}
      stroke="var(--fret-color)"
      stroke-width="0.8"
      opacity="0.4"
    />
  {/each}
  <line
    x1={leftPadding - 1}
    y1={fretY(displayFrets.length)}
    x2={leftPadding + (stringCount - 1) * stringSpacing + 1}
    y2={fretY(displayFrets.length)}
    stroke="var(--fret-color)"
    stroke-width="0.8"
    opacity="0.4"
  />

  <!-- Strings -->
  {#each Array.from({ length: stringCount }, (_, i) => i) as stringIdx}
    <line
      x1={stringX(stringIdx)}
      y1={topPadding}
      x2={stringX(stringIdx)}
      y2={fretY(displayFrets.length)}
      stroke="var(--string-color)"
      stroke-width={0.6 + (stringCount - 1 - stringIdx) * 0.1}
      opacity="0.6"
    />
  {/each}

  <!-- Muted/Open indicators -->
  {#each voicing.frets as fret, stringIdx}
    {#if fret === -1}
      <text
        x={stringX(stringIdx)}
        y={topPadding - 4}
        text-anchor="middle"
        font-size="6"
        fill="var(--text-muted)"
        font-family="'Work Sans', system-ui, sans-serif"
      >x</text>
    {:else if fret === 0}
      <circle
        cx={stringX(stringIdx)}
        cy={topPadding - 5}
        r="2.5"
        fill="none"
        stroke="var(--text-muted)"
        stroke-width="0.8"
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
      opacity="0.7"
    />
  {/each}

  <!-- Fretted dots -->
  {#each voicing.frets as fret, stringIdx}
    {#if fret > 0}
      {@const isRoot = voicing.pitchClasses.length > 0 && (() => {
        let soundingIdx = 0;
        for (let s = 0; s < stringIdx; s++) {
          if (voicing.frets[s] !== -1) soundingIdx++;
        }
        return soundingIdx < voicing.pitchClasses.length && voicing.pitchClasses[soundingIdx] === voicing.pitchClasses[0];
      })()}
      <circle
        cx={stringX(stringIdx)}
        cy={dotY(fret)}
        r={dotRadius}
        fill={isRoot ? 'var(--root-bg)' : 'var(--dot-bg)'}
      />
    {/if}
  {/each}
</svg>

<style>
  .mini-chord-svg {
    display: block;
  }
</style>
