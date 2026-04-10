<script lang="ts">
  import Fretboard from './Fretboard.svelte';
  import { ALL_TUNINGS, STANDARD } from '../lib/tunings';
  import { ALL_ROOTS, displayAccidental } from '../lib/music';
  import { exportFretboardPdf } from '../lib/pdf';
  import { responsive } from '../lib/responsive.svelte';

  // Fretboard SVG width (must match Fretboard.svelte defaults: leftPadding=50, fretSpacing=75, fretCount=15, rightPadding=20)
  const FB_SVG_WIDTH = 50 + 16 * 75 + 20; // 1270
  const needsVertical = $derived(responsive.windowWidth < FB_SVG_WIDTH + 60);

  let selectedTuning = $state(STANDARD);
  let mode: 'notes' | 'intervals' = $state('notes');
  let rootNote = $state('C');

  function handleTuningChange(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    selectedTuning = ALL_TUNINGS.find(t => t.name === name) ?? STANDARD;
  }

  async function handleExportPdf() {
    const title = mode === 'intervals'
      ? `Fretboard — ${selectedTuning.name} Tuning — Intervals from ${displayAccidental(rootNote)}`
      : `Fretboard — ${selectedTuning.name} Tuning — All Notes`;
    await exportFretboardPdf(
      { tuning: selectedTuning.notes, fretCount: 14, mode, rootNote },
      'fretboard.pdf',
      title,
    );
  }
</script>

<div class="page-root">
  <div class="print-title">
    {#if mode === 'intervals'}
      Fretboard Map - {selectedTuning.name} Tuning - Intervals from {displayAccidental(rootNote)}
    {:else}
      Fretboard Map - {selectedTuning.name} Tuning - All Notes
    {/if}
  </div>

  <div class="controls no-print">
    <div class="control-group">
      <label for="tuning-select">Tuning</label>
      <select id="tuning-select" value={selectedTuning.name} onchange={handleTuningChange}>
        {#each ALL_TUNINGS as t}
          <option value={t.name}>{t.name}</option>
        {/each}
      </select>
    </div>

    <div class="control-group">
      <label for="mode-select">Display</label>
      <select id="mode-select" bind:value={mode}>
        <option value="notes">Note Names</option>
        <option value="intervals">Intervals</option>
      </select>
    </div>

    {#if mode === 'intervals'}
      <div class="control-group">
        <label for="root-select">Root</label>
        <select id="root-select" bind:value={rootNote}>
          {#each ALL_ROOTS as r}
            <option value={r}>{displayAccidental(r)}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="control-group" style="margin-left: auto;">
      <button class="btn btn-small" onclick={handleExportPdf}>
        Download PDF
      </button>
    </div>
  </div>

  <div class="fretboard-container scroll-area" class:mobile-vertical={needsVertical}>
    <div class="fretboard-scroll">
      <Fretboard
        tuning={selectedTuning}
        fretCount={15}
        {mode}
        {rootNote}
        vertical={needsVertical}
      />
    </div>
  </div>
</div>

<style>
  .page-root {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .page-root > .controls {
    flex-shrink: 0;
    padding-right: 24px;
  }
  .scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }
  @media (max-width: 768px) {
    .page-root > .controls {
      padding-right: 10px;
    }
  }
</style>
