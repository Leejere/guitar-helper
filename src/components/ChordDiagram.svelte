<script lang="ts">
  import { Note, Interval, Chord } from 'tonal';
  import { displayAccidental, getIntervalLabel } from '../lib/music';
  import { playStrum } from '../lib/audio';
  import { pool } from '../lib/pool.svelte';
  import { progression } from '../lib/progression.svelte';
  import { toast } from '../lib/toast.svelte';
  import type { Voicing } from '../lib/voicings';
  import type { Tuning } from '../lib/tunings';

  interface Props {
    voicing: Voicing;
    tuning: Tuning;
    chordName?: string;
    initialShowIntervals?: boolean;
    hidePoolButton?: boolean;
  }

  let { voicing, tuning, chordName, initialShowIntervals = false, hidePoolButton = false }: Props = $props();

  let showIntervals = $state(false);

  // Sync with parent's toggle when it changes
  $effect(() => {
    showIntervals = initialShowIntervals;
  });

  let chordRoot = $derived.by(() => {
    if (!chordName) return null;
    const info = Chord.get(chordName);
    return info.tonic || null;
  });

  let poolKey = $derived(pool.keyFor(voicing.frets, chordName ?? ''));
  let isInPool = $derived(pool.entries.some(e => e.key === poolKey));
  let isUsedInProgression = $derived(progression.hasPoolKey(poolKey));

  let progFlash = $state(false);
  let poolFlash = $state(false);

  function addToProgression(e: MouseEvent) {
    e.stopPropagation();
    if (!isInPool) pool.add(voicing, tuning, chordName ?? '');
    const pending = progression.pendingCellIdx;
    if (pending !== null && pending >= 0 && pending < progression.cells.length) {
      // Place into the specific cell (overwrite even if occupied)
      progression.cells[pending] = { ...progression.cells[pending], poolKey: poolKey };
      progression.persist();
      progression.pendingCellIdx = null;
      toast.show('Placed voicing into progression cell');
      progFlash = true;
      setTimeout(() => progFlash = false, 400);
      setTimeout(() => { progression.pendingNav = 'progression'; }, 1000);
    } else {
      progression.pushFromPool(poolKey);
      toast.show('Added voicing to the tail of the progression');
      progFlash = true;
      setTimeout(() => progFlash = false, 400);
    }
  }

  function handlePoolClick(e: MouseEvent) {
    e.stopPropagation();
    if (isInPool) {
      if (isUsedInProgression) return;
      pool.remove(poolKey);
      toast.show('Removed voicing from pool');
    } else {
      pool.add(voicing, tuning, chordName ?? '');
      toast.show('Added voicing to pool');
      poolFlash = true;
      setTimeout(() => poolFlash = false, 400);
    }
  }

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

  function getDotLabel(stringIdx: number, fret: number): string {
    const note = getNoteAt(stringIdx, fret);
    if (showIntervals && chordRoot) {
      return getIntervalLabel(chordRoot, note);
    }
    return displayAccidental(Note.pitchClass(note));
  }
</script>

<div class="chord-card">
  {#if !hidePoolButton}
    <button
      class="pool-btn"
      class:in-pool={isInPool}
      class:flash={poolFlash}
      class:disabled={isInPool && isUsedInProgression}
      title={isInPool ? (isUsedInProgression ? 'Used in progression' : 'Remove from pool') : 'Add to pool'}
      onclick={handlePoolClick}
      disabled={isInPool && isUsedInProgression}
    >
      {isInPool ? '− Drop' : '+ Pool'}
    </button>
    <button
      class="prog-btn"
      class:flash={progFlash}
      title="Add to progression"
      onclick={addToProgression}
    >
      + Progression
    </button>
  {/if}
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
        {@const isRoot = voicing.pitchClasses.length > 0 && Note.pitchClass(getNoteAt(stringIdx, 0)) === voicing.pitchClasses[0]}
        <circle
          cx={stringX(stringIdx)}
          cy={topPadding - 15}
          r="8"
          fill={isRoot ? 'var(--root-bg)' : 'none'}
          stroke={isRoot ? 'var(--root-bg)' : 'var(--text-muted)'}
          stroke-width="1.5"
        />
        <text
          x={stringX(stringIdx)}
          y={topPadding - 11.5}
          text-anchor="middle"
          font-size="8"
          fill={isRoot ? '#fff' : 'var(--text-muted)'}
          font-family="'Work Sans', system-ui, sans-serif"
          font-weight="700"
        >{getDotLabel(stringIdx, 0)}</text>
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
        >{getDotLabel(stringIdx, fret)}</text>
      {/if}
    {/each}
  </svg>

  <div class="chord-actions">
    <label class="intervals-toggle" onclick={(e) => e.stopPropagation()}>
      <span class="toggle-label">Intervals</span>
      <span class="toggle-switch" class:on={showIntervals} onclick={() => showIntervals = !showIntervals} role="switch" aria-checked={showIntervals} tabindex="0" onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showIntervals = !showIntervals; } }}>
        <span class="toggle-knob"></span>
      </span>
    </label>
    <button class="btn btn-small btn-secondary btn-icon" onclick={(e) => { e.stopPropagation(); handlePlay(); }} title="Play">
      &#9654;
    </button>
  </div>
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
    position: relative;
    overflow: visible;
    margin-top: 14px;
  }

  .pool-btn,
  .prog-btn {
    position: absolute;
    top: -12px;
    width: 52px;
    height: 22px;
    border-radius: 4px;
    border: 1.5px solid var(--border);
    background: var(--bg-card);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.15s;
    z-index: 1;
  }
  .pool-btn {
    right: -8px;
  }
  .prog-btn {
    right: 48px;
    width: 80px;
  }
  .pool-btn:hover,
  .prog-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .pool-btn.in-pool {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }
  .pool-btn.in-pool:hover {
    opacity: 0.8;
  }
  .pool-btn.disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .pool-btn.disabled:hover {
    opacity: 0.35;
  }

  .pool-btn.flash,
  .prog-btn.flash {
    animation: btn-flash 0.4s ease-out;
  }

  @keyframes btn-flash {
    0% { background: var(--accent); border-color: var(--accent); color: var(--bg); transform: scale(1.15); }
    100% { transform: scale(1); }
  }

  .chord-actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .btn-icon {
    min-width: 0;
    padding: 4px 8px;
  }

  .intervals-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    user-select: none;
  }
  .toggle-label {
    font-size: 11px;
    color: var(--text-muted);
  }
  .toggle-switch {
    position: relative;
    width: 30px;
    height: 16px;
    background: var(--border);
    border-radius: 8px;
    transition: background 0.2s;
    display: inline-block;
    cursor: pointer;
  }
  .toggle-switch.on {
    background: var(--accent);
  }
  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  .toggle-switch.on .toggle-knob {
    transform: translateX(14px);
  }

  svg {
    display: block;
  }
</style>
