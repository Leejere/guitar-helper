<script lang="ts">
  import Fretboard from './Fretboard.svelte';
  import { ALL_TUNINGS, STANDARD } from '../lib/tunings';
  import { ALL_ROOTS, displayAccidental } from '../lib/music';
  import { exportFretboardPdf } from '../lib/pdf';
  import { responsive } from '../lib/responsive.svelte';
  import { fretboardMapState } from '../lib/fretboard-map-state.svelte';
  import { t, tTuning } from '../lib/i18n.svelte';
  import { playNote } from '../lib/audio';

  // Fretboard SVG width (must match Fretboard.svelte defaults: leftPadding=50, fretSpacing=75, fretCount=15, rightPadding=20)
  const FB_SVG_WIDTH = 50 + 16 * 75 + 20; // 1270
  const needsVertical = $derived(responsive.windowWidth < FB_SVG_WIDTH + 60);

  let selectedTuning = $derived(fretboardMapState.selectedTuning);
  let mode = $derived(fretboardMapState.mode);
  let rootNote = $derived(fretboardMapState.rootNote);

  function handleTuningChange(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    fretboardMapState.setTuning(ALL_TUNINGS.find(t => t.name === name) ?? STANDARD);
  }

  async function handleExportPdf() {
    const title = mode === 'intervals'
      ? t('fretboard.pdfTitle.intervals', tTuning(selectedTuning.name), displayAccidental(rootNote))
      : t('fretboard.pdfTitle.notes', tTuning(selectedTuning.name));
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
      {t('fretboard.printTitle.intervals', tTuning(selectedTuning.name), displayAccidental(rootNote))}
    {:else}
      {t('fretboard.printTitle.notes', tTuning(selectedTuning.name))}
    {/if}
  </div>

  <div class="controls no-print">
    <div class="control-group">
      <label for="tuning-select">{t('common.tuning')}</label>
      <select id="tuning-select" value={selectedTuning.name} onchange={handleTuningChange}>
        {#each ALL_TUNINGS as tn}
          <option value={tn.name}>{tTuning(tn.name)}</option>
        {/each}
      </select>
    </div>

    <label class="intervals-toggle">
      <span class="toggle-label">{t('common.intervals')}</span>
      <span class="toggle-switch" class:on={mode === 'intervals'} onclick={() => fretboardMapState.setMode(mode === 'intervals' ? 'notes' : 'intervals')} role="switch" aria-checked={mode === 'intervals'} tabindex="0" onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fretboardMapState.setMode(mode === 'intervals' ? 'notes' : 'intervals'); } }}>
        <span class="toggle-knob"></span>
      </span>
    </label>

    {#if mode === 'intervals'}
      <div class="control-group">
        <label for="root-select">{t('common.root')}</label>
        <select id="root-select" value={rootNote} onchange={(e) => fretboardMapState.setRootNote((e.target as HTMLSelectElement).value)}>
          {#each ALL_ROOTS as r}
            <option value={r}>{displayAccidental(r)}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="control-group" style="margin-left: auto;">
      <button class="btn btn-small" onclick={handleExportPdf}>
        {t('fretboard.downloadPdf')}
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
        onNoteClick={(_s, _f, note) => playNote(note)}
      />
    </div>
  </div>
</div>

<style>
  .intervals-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }
  .toggle-label {
    font-size: 14px;
    color: var(--text-muted);
  }
  .toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    background: var(--border);
    border-radius: 10px;
    transition: background 0.2s;
    display: inline-block;
    cursor: pointer;
  }
  .toggle-switch.on {
    background: var(--accent);
  }
  .toggle-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  .toggle-switch.on .toggle-knob {
    transform: translateX(16px);
  }
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
