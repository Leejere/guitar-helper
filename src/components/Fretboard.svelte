<script lang="ts">
  import { Note, Interval } from 'tonal';
  import { displayAccidental } from '../lib/music';
  import type { Tuning } from '../lib/tunings';

  interface Props {
    tuning: Tuning;
    fretCount?: number;
    startFret?: number;
    mode?: 'notes' | 'intervals';
    rootNote?: string;
    selectedPositions?: { string: number; fret: number }[];
    activeVoicing?: number[] | null; // length=6, -1=muted, 0=open, 1+=fretted
    interactive?: boolean;
    compact?: boolean;
    leftPaddingOverride?: number;
    highlightNotes?: string[];
    onNoteClick?: (stringIdx: number, fret: number) => void;
    filterPositions?: { string: number; fret: number }[];
    onPositionClick?: (string: number, fret: number) => void;
    onFretSelect?: (fret: number) => void;
    selectedFret?: number | null;
    positionDots?: { string: number; fret: number }[];
    clickableNotes?: Set<string>;
    dimHighlights?: boolean;
    vertical?: boolean;
  }

  let {
    tuning,
    fretCount = 15,
    startFret = 0,
    mode = 'notes',
    rootNote = 'C',
    selectedPositions = [],
    activeVoicing = null,
    interactive = false,
    compact = false,
    leftPaddingOverride,
    highlightNotes,
    onNoteClick,
    filterPositions = [],
    onPositionClick,
    onFretSelect,
    selectedFret = null,
    positionDots,
    clickableNotes,
    dimHighlights = false,
    vertical = false,
  }: Props = $props();

  const stringCount = 6;
  const stringSpacing = 38;
  const fretSpacing = compact ? 50 : 75;
  const dotRadius = compact ? 11 : 13;
  const topPadding = 40;
  const bottomPadding = 20;
  const leftPadding = leftPaddingOverride ?? (compact ? 30 : 50);
  const rightPadding = 20;

  // Build a chroma → preferred pitch class map from highlightNotes for consistent enharmonic spelling
  const respellMap = $derived.by(() => {
    const map = new Map<number, string>();
    if (highlightNotes && highlightNotes.length > 0) {
      const usesFlats = highlightNotes[0]?.includes('b') ?? false;
      const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
      const names = usesFlats ? FLAT : SHARP;
      for (const n of highlightNotes) {
        const c = Note.chroma(n);
        if (c !== undefined) map.set(c, Note.pitchClass(n));
      }
      for (let c = 0; c < 12; c++) {
        if (!map.has(c)) map.set(c, names[c]);
      }
    }
    return map;
  });

  function getNoteAt(stringIdx: number, fret: number): string {
    const openNote = tuning.notes[stringIdx];
    return Note.transpose(openNote, Interval.fromSemitones(fret));
  }

  function getPitchClass(stringIdx: number, fret: number): string {
    const raw = Note.pitchClass(getNoteAt(stringIdx, fret));
    if (respellMap.size > 0) {
      const c = Note.chroma(raw);
      if (c !== undefined && respellMap.has(c)) return respellMap.get(c)!;
    }
    return raw;
  }

  function getLabel(stringIdx: number, fret: number): string {
    const pc = getPitchClass(stringIdx, fret);
    if (mode === 'intervals' && rootNote) {
      const interval = Interval.distance(rootNote, pc);
      const map: Record<string, string> = {
        '1P': 'R', '2m': '♭2', '2M': '2', '2A': '♯2',
        '3m': '♭3', '3M': '3', '4P': '4', '4A': '♯4',
        '5d': '♭5', '5P': '5', '5A': '♯5', '6m': '♭6',
        '6M': '6', '7m': '♭7', '7M': '7',
      };
      return map[interval] ?? interval;
    }
    return displayAccidental(pc);
  }

  function isRoot(stringIdx: number, fret: number): boolean {
    if (mode === 'intervals') {
      return getPitchClass(stringIdx, fret) === Note.pitchClass(rootNote);
    }
    return false;
  }

  const NATURAL_NOTES = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  const NATURAL_INTERVALS = new Set(['R', '2', '3', '4', '5', '6', '7']);

  function isNatural(stringIdx: number, fret: number): boolean {
    if (mode === 'intervals') {
      return NATURAL_INTERVALS.has(getLabel(stringIdx, fret));
    }
    return NATURAL_NOTES.has(getPitchClass(stringIdx, fret));
  }

  function isSelected(stringIdx: number, fret: number): boolean {
    return selectedPositions.some(p => p.string === stringIdx && p.fret === fret);
  }

  function isHighlighted(stringIdx: number, fret: number): boolean {
    if (positionDots) return positionDots.some(p => p.string === stringIdx && p.fret === fret);
    if (!highlightNotes || highlightNotes.length === 0) return true;
    const c = Note.chroma(getPitchClass(stringIdx, fret));
    return highlightNotes.some(n => Note.chroma(n) === c);
  }

  function isInActiveVoicing(stringIdx: number, fret: number): boolean {
    if (!activeVoicing) return false;
    return activeVoicing[stringIdx] === fret;
  }

  function isActiveVoicingRoot(stringIdx: number, fret: number): boolean {
    if (!activeVoicing || !highlightNotes || highlightNotes.length === 0) return false;
    if (activeVoicing[stringIdx] !== fret) return false;
    const c = Note.chroma(getPitchClass(stringIdx, fret));
    return c === Note.chroma(highlightNotes[0]);
  }

  function handleClick(stringIdx: number, fret: number) {
    if (interactive && onPositionClick) {
      onPositionClick(stringIdx, fret);
    }
  }

  function handleNoteClick(stringIdx: number, fret: number) {
    if (onNoteClick) onNoteClick(stringIdx, fret);
  }

  function isFiltered(stringIdx: number, fret: number): boolean {
    return filterPositions.some(p => p.string === stringIdx && p.fret === fret);
  }

  function isClickable(stringIdx: number, fret: number): boolean {
    if (!clickableNotes) return true;
    return clickableNotes.has(`${stringIdx}:${fret}`);
  }

  // Fret marker positions (standard dot inlays)
  const markerFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21];
  const doubleMarkerFrets = [12];

  let displayFrets = $derived(Array.from({ length: fretCount - startFret + 1 }, (_, i) => i + startFret));
  let svgWidth = $derived(leftPadding + displayFrets.length * fretSpacing + rightPadding);
  const fretSelectRowHeight = 30;
  let svgHeight = $derived(topPadding + (stringCount - 1) * stringSpacing + bottomPadding + (onFretSelect ? fretSelectRowHeight : 0));

  function fretX(fret: number): number {
    return leftPadding + (fret - startFret) * fretSpacing;
  }

  function stringY(stringIdx: number): number {
    // stringIdx 0 = lowest string (bottom), 5 = highest (top)
    return topPadding + (stringCount - 1 - stringIdx) * stringSpacing;
  }

  function dotX(fret: number): number {
    if (fret === 0) return fretX(0) - 15;
    return fretX(fret) - fretSpacing / 2;
  }
</script>

<div
  class="fretboard-wrap"
  class:vertical
  style={vertical ? `width:${svgHeight}px;height:${svgWidth}px` : ''}
>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width={svgWidth}
  height={svgHeight}
  viewBox="0 0 {svgWidth} {svgHeight}"
  class="fretboard-svg"
  style={vertical ? `position:absolute;top:0;left:0;transform-origin:top left;transform:translateX(${svgHeight}px) rotate(90deg)` : ''}
>
  <!-- Background -->
  <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="var(--fretboard-bg)" rx="4" />

  <!-- Fret markers (dots on the board) -->
  {#each displayFrets as fret}
    {#if fret > 0 && markerFrets.includes(fret) && !doubleMarkerFrets.includes(fret)}
      <circle
        cx={fretX(fret) - fretSpacing / 2}
        cy={topPadding + (stringCount - 1) * stringSpacing / 2}
        r="4"
        fill="var(--overlay-subtle)"
      />
    {/if}
    {#if fret > 0 && doubleMarkerFrets.includes(fret)}
      <circle
        cx={fretX(fret) - fretSpacing / 2}
        cy={topPadding + (stringCount - 1) * stringSpacing / 2 - 25}
        r="4"
        fill="var(--overlay-subtle)"
      />
      <circle
        cx={fretX(fret) - fretSpacing / 2}
        cy={topPadding + (stringCount - 1) * stringSpacing / 2 + 25}
        r="4"
        fill="var(--overlay-subtle)"
      />
    {/if}
  {/each}

  <!-- Nut (if starting from fret 0) -->
  {#if startFret === 0}
    <rect x={leftPadding - 3} y={topPadding - 5} width="6" height={(stringCount - 1) * stringSpacing + 10} fill="var(--nut-color)" rx="2" />
  {/if}

  <!-- Fret wires -->
  {#each displayFrets as fret}
    {#if fret > 0}
      <line
        x1={fretX(fret)}
        y1={topPadding - 5}
        x2={fretX(fret)}
        y2={topPadding + (stringCount - 1) * stringSpacing + 5}
        stroke="var(--fret-color)"
        stroke-width={fret === startFret && startFret > 0 ? 4 : 2}
        opacity="0.6"
      />
    {/if}
  {/each}

  <!-- Strings -->
  {#each Array.from({ length: stringCount }, (_, i) => i) as stringIdx}
    {@const thickness = 1 + (stringCount - 1 - stringIdx) * 0.4}
    <line
      x1={startFret === 0 ? leftPadding : leftPadding - 10}
      y1={stringY(stringIdx)}
      x2={svgWidth - rightPadding}
      y2={stringY(stringIdx)}
      stroke="var(--string-color)"
      stroke-width={thickness}
      opacity="0.8"
    />
  {/each}

  <!-- Fret numbers -->
  {#each displayFrets as fret}
    {#if fret > 0}
      <text
        x={fretX(fret) - fretSpacing / 2}
        y={topPadding - 15}
        text-anchor="middle"
        dominant-baseline={vertical ? 'central' : undefined}
        font-size="11"
        fill="var(--overlay-medium)"
        font-family="'Work Sans', system-ui, sans-serif"
        transform={vertical ? `rotate(-90, ${fretX(fret) - fretSpacing / 2}, ${topPadding - 15})` : undefined}
      >{fret}</text>
    {/if}
  {/each}

  <!-- String labels (tuning notes) -->
  {#if !compact}
    {#each Array.from({ length: stringCount }, (_, i) => i) as stringIdx}
      <text
        x="10"
        y={vertical ? stringY(stringIdx) : stringY(stringIdx) + 4}
        text-anchor="start"
        dominant-baseline={vertical ? 'central' : undefined}
        font-size="12"
        fill="var(--overlay-medium)"
        font-family="'Work Sans', system-ui, sans-serif"
        font-weight="600"
        transform={vertical ? `rotate(-90, 10, ${stringY(stringIdx)})` : undefined}
      >{Note.pitchClass(tuning.notes[stringIdx])}</text>
    {/each}
  {/if}

  <!-- Note dots -->
  {#each Array.from({ length: stringCount }, (_, i) => i) as stringIdx}
    {#each displayFrets as fret}
      {@const highlighted = isHighlighted(stringIdx, fret)}
      {@const selected = isSelected(stringIdx, fret)}
      {@const root = isRoot(stringIdx, fret)}
      {@const inVoicing = isInActiveVoicing(stringIdx, fret)}
      {@const voicingRoot = isActiveVoicingRoot(stringIdx, fret)}
      {@const natural = isNatural(stringIdx, fret)}
      {@const open = fret === 0}
      {@const showDot = interactive ? selected : highlighted}
      {@const noteClickable = isClickable(stringIdx, fret)}
      {#if inVoicing}
        <!-- Active voicing dot (prominent) -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g class="note-dot voicing-dot" class:clickable={!!onNoteClick && noteClickable} class:not-clickable={!!onNoteClick && !noteClickable} onclick={() => handleNoteClick(stringIdx, fret)}>
          <circle
            cx={dotX(fret)}
            cy={stringY(stringIdx)}
            r={dotRadius + 2}
            fill={voicingRoot ? 'var(--root-bg)' : 'var(--dot-bg)'}
            stroke="#fff"
            stroke-width="2"
          />
          <text
            x={dotX(fret)}
            y={vertical ? stringY(stringIdx) : stringY(stringIdx) + 4}
            text-anchor="middle"
            dominant-baseline={vertical ? 'central' : undefined}
            font-size={compact ? '9' : '11'}
            fill="#fff"
            font-family="'Work Sans', system-ui, sans-serif"
            font-weight="700"
            transform={vertical ? `rotate(-90, ${dotX(fret)}, ${stringY(stringIdx)})` : undefined}
          >{getLabel(stringIdx, fret)}</text>
          {#if isFiltered(stringIdx, fret)}
            <circle cx={dotX(fret)} cy={stringY(stringIdx)} r={dotRadius + 5} fill="none" stroke="var(--highlight)" stroke-width="2.5" />
          {/if}
        </g>
      {:else if showDot}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g
          class="note-dot"
          class:interactive
          class:clickable={!!onNoteClick && noteClickable}
          class:not-clickable={!!onNoteClick && !noteClickable}
          onclick={() => { handleClick(stringIdx, fret); handleNoteClick(stringIdx, fret); }}
        >
          {#if open && !interactive}
            <!-- Open string: outlined ring -->
            <circle
              cx={dotX(fret)}
              cy={stringY(stringIdx)}
              r={dotRadius}
              fill={root ? 'var(--root-bg)' : 'var(--dot-bg)'}
              opacity={activeVoicing ? (isFiltered(stringIdx, fret) ? 0.7 : 0.15) : dimHighlights ? 0.12 : 1}
              stroke="#fff"
              stroke-width="2"
            />
          {:else}
            <circle
              cx={dotX(fret)}
              cy={stringY(stringIdx)}
              r={natural ? dotRadius : dotRadius - 2}
              fill={root ? 'var(--root-bg)' : selected ? 'var(--accent)' : 'var(--dot-bg)'}
              opacity={activeVoicing ? (isFiltered(stringIdx, fret) ? 0.7 : 0.15) : dimHighlights ? 0.12 : (natural ? 1 : 0.4)}
            />
          {/if}
            <text
              x={dotX(fret)}
              y={vertical ? stringY(stringIdx) : stringY(stringIdx) + 4}
              text-anchor="middle"
              dominant-baseline={vertical ? 'central' : undefined}
              font-size={compact ? '9' : (activeVoicing ? '9' : (natural ? '10' : '8'))}
              fill={activeVoicing ? '#fff' : (root || selected || (natural && !interactive) ? '#fff' : 'var(--dot-text)')}
              font-family="'Work Sans', system-ui, sans-serif"
              font-weight={natural ? '700' : '600'}
              opacity={activeVoicing ? (isFiltered(stringIdx, fret) ? 1 : 0.5) : dimHighlights ? 0.35 : (natural ? 1 : 0.8)}
              transform={vertical ? `rotate(-90, ${dotX(fret)}, ${stringY(stringIdx)})` : undefined}
            >{getLabel(stringIdx, fret)}</text>
          {#if isFiltered(stringIdx, fret)}
            <circle cx={dotX(fret)} cy={stringY(stringIdx)} r={dotRadius + 4} fill="none" stroke="var(--highlight)" stroke-width="2.5" />
          {/if}
        </g>
      {:else if interactive}
        <!-- Clickable area for interactive mode -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g class="click-target" onclick={() => handleClick(stringIdx, fret)}>
          <circle
            cx={dotX(fret)}
            cy={stringY(stringIdx)}
            r={dotRadius}
            fill="var(--overlay-faint)"
          />
          <text
            x={dotX(fret)}
            y={vertical ? stringY(stringIdx) : stringY(stringIdx) + 4}
            text-anchor="middle"
            dominant-baseline={vertical ? 'central' : undefined}
            font-size="9"
            fill="var(--overlay-subtle)"
            font-family="'Work Sans', system-ui, sans-serif"
            font-weight="600"
            transform={vertical ? `rotate(-90, ${dotX(fret)}, ${stringY(stringIdx)})` : undefined}
          >{getLabel(stringIdx, fret)}</text>
        </g>
      {/if}
    {/each}
  {/each}

  <!-- Active voicing muted/open string indicators -->
  {#if activeVoicing}
    {#each activeVoicing as fret, stringIdx}
      {#if fret === -1}
        <text
          x={leftPadding - 15}
          y={vertical ? stringY(stringIdx) : stringY(stringIdx) + 4}
          text-anchor="middle"
          dominant-baseline={vertical ? 'central' : undefined}
          font-size="14"
          fill="var(--error)"
          font-family="'Work Sans', system-ui, sans-serif"
          font-weight="700"
          transform={vertical ? `rotate(-90, ${leftPadding - 15}, ${stringY(stringIdx)})` : undefined}
        >x</text>
      {:else if fret === 0}
        <circle
          cx={leftPadding - 15}
          cy={stringY(stringIdx)}
          r="7"
          fill="none"
          stroke="var(--accent)"
          stroke-width="2"
        />
      {/if}
    {/each}
  {/if}

  <!-- Fret selector row (below the strings) -->
  {#if onFretSelect}
    {@const selectorY = topPadding + (stringCount - 1) * stringSpacing + bottomPadding + 2}
    {#each displayFrets as fret}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g class="fret-select-target" class:fret-selected={selectedFret === fret} onclick={() => onFretSelect(fret)}>
        <rect
          x={fret === 0 ? dotX(fret) - 14 : fretX(fret) - fretSpacing / 2 - 2}
          y={selectorY}
          width={fret === 0 ? 28 : fretSpacing - 2}
          height={fretSelectRowHeight - 4}
          rx="4"
          fill={selectedFret === fret ? 'var(--highlight)' : 'var(--overlay-faint)'}
        />
        <text
          x={fret === 0 ? dotX(fret) : fretX(fret) - fretSpacing / 2 + (fretSpacing - 2) / 2 - 2}
          y={vertical ? selectorY + (fretSelectRowHeight - 4) / 2 : selectorY + (fretSelectRowHeight - 4) / 2 + 4}
          text-anchor="middle"
          dominant-baseline={vertical ? 'central' : undefined}
          font-size="11"
          font-weight="600"
          fill={selectedFret === fret ? 'var(--dot-text)' : 'var(--overlay-medium)'}
          font-family="'Work Sans', system-ui, sans-serif"
          transform={vertical ? `rotate(-90, ${fret === 0 ? dotX(fret) : fretX(fret) - fretSpacing / 2 + (fretSpacing - 2) / 2 - 2}, ${selectorY + (fretSelectRowHeight - 4) / 2})` : undefined}
        >{fret === 0 ? 'Open' : fret}</text>
      </g>
    {/each}
  {/if}
</svg>
</div>

<style>
  .fretboard-svg {
    display: block;
  }

  .fretboard-wrap {
    display: inline-block;
  }

  .fretboard-wrap.vertical {
    position: relative;
    overflow: hidden;
  }

  .note-dot.interactive {
    cursor: pointer;
  }

  .note-dot.interactive:hover circle {
    filter: brightness(1.2);
  }

  .voicing-dot circle {
    filter: drop-shadow(0 0 4px rgba(212, 135, 77, 0.5));
  }

  .note-dot.clickable,
  .voicing-dot.clickable {
    cursor: pointer;
  }

  .note-dot.clickable:hover circle {
    filter: brightness(1.3);
  }

  .note-dot.not-clickable,
  .voicing-dot.not-clickable {
    cursor: not-allowed;
    opacity: 0.35;
  }

  .click-target {
    cursor: pointer;
  }

  .click-target:hover circle {
    fill: var(--overlay-subtle);
  }

  .click-target:hover text {
    fill: var(--overlay-medium);
  }

  .fret-select-target {
    cursor: pointer;
  }

  .fret-select-target:hover rect {
    fill: var(--overlay-subtle);
  }

  .fret-select-target.fret-selected:hover rect {
    fill: var(--highlight);
  }
</style>
