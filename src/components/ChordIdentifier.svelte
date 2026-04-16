<script lang="ts">
  import { Note, Interval } from 'tonal';
  import Fretboard from './Fretboard.svelte';
  import ChordDiagram from './ChordDiagram.svelte';
  import { identifyChords, fretsToVoicing, displayAccidental, type ChordCandidate } from '../lib/music';
  import { playStrum } from '../lib/audio';
  import { ALL_TUNINGS, STANDARD } from '../lib/tunings';
  import { responsive } from '../lib/responsive.svelte';
  import { identifierState } from '../lib/identifier-state.svelte';
  import { t, tTuning } from '../lib/i18n.svelte';

  // Fretboard SVG width (must match Fretboard.svelte defaults: leftPadding=50, fretSpacing=75, fretCount=15, rightPadding=20)
  const FB_SVG_WIDTH = 50 + 16 * 75 + 20; // 1270

  interface Props {
    onChordSelect?: (chordName: string, frets?: number[]) => void;
  }

  let { onChordSelect }: Props = $props();

  let selectedTuning = $derived(identifierState.selectedTuning);
  let selectedPositions = $derived(identifierState.selectedPositions);

  const needsVertical = $derived(responsive.windowWidth < FB_SVG_WIDTH + 60);

  function handleTuningChange(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    const tuning = ALL_TUNINGS.find(t => t.name === name) ?? STANDARD;
    identifierState.setTuning(tuning);
  }

  function handlePositionClick(stringIdx: number, fret: number) {
    identifierState.togglePosition(stringIdx, fret);
  }

  function getSelectedNotes(): string[] {
    return [...selectedPositions]
      .sort((a, b) => a.string - b.string)
      .map(p => Note.transpose(selectedTuning.notes[p.string], Interval.fromSemitones(p.fret)));
  }

  let candidates = $derived.by(() => {
    if (selectedPositions.length < 2) return { exact: [] as ChordCandidate[], vague: [] as ChordCandidate[] };
    const all = identifyChords(selectedPositions, selectedTuning.notes);
    return {
      exact: all.filter(c => c.exact),
      vague: all.filter(c => !c.exact),
    };
  });

  let selectedNoteNames = $derived.by(() => {
    return getSelectedNotes().map(n => Note.pitchClass(n));
  });

  function clearSelection() {
    identifierState.clear();
  }

  async function handlePlay() {
    const notes = getSelectedNotes();
    if (notes.length > 0) {
      await playStrum(notes);
    }
  }
</script>

<div class="page-root">
  <div class="controls no-print">
    <div class="control-group">
      <label for="tuning-id">{t('common.tuning')}</label>
      <select id="tuning-id" value={selectedTuning.name} onchange={handleTuningChange}>
        {#each ALL_TUNINGS as tn}
          <option value={tn.name}>{tTuning(tn.name)}</option>
        {/each}
      </select>
    </div>

    <button class="btn btn-secondary" onclick={clearSelection}>{t('common.clear')}</button>
    {#if selectedPositions.length > 0}
      <button class="btn" onclick={handlePlay}>&#9654; {t('common.play')}</button>
    {/if}
  </div>

  <p class="info-msg no-print">
    {t('identifier.instruction')}
  </p>

  <div class:mobile-id-layout={needsVertical} class:scroll-area={!needsVertical}>
    <div class="fretboard-container" class:mobile-vertical={needsVertical}>
      <div class="fretboard-scroll">
        <Fretboard
          tuning={selectedTuning}
          fretCount={15}
          mode="notes"
          interactive={true}
          {selectedPositions}
          onPositionClick={handlePositionClick}
          vertical={needsVertical}
        />
      </div>
    </div>

    {#if needsVertical}
      <div class="results-section">
        {#if selectedPositions.length > 0}
          <p class="info-msg">
            {t('finder.selectedNotes')} <strong>{selectedNoteNames.map(n => displayAccidental(n)).join(', ')}</strong>
          </p>

          {#if candidates.exact.length > 0}
            <h3 class="results-heading">{t('identifier.matches')}</h3>
            <div class="candidate-grid">
              {#each candidates.exact as candidate}
                <button class="candidate-card" onclick={() => onChordSelect?.(candidate.name, candidate.frets)}>
                  <span class="candidate-name">{displayAccidental(candidate.name)}</span>
                  <ChordDiagram
                    voicing={fretsToVoicing(candidate.frets, selectedTuning.notes)}
                    tuning={selectedTuning}
                    chordName={candidate.name}
                  />
                </button>
              {/each}
            </div>
          {/if}

          {#if candidates.vague.length > 0}
            <h3 class="results-heading">{t('identifier.relatedChords')}</h3>
            <div class="candidate-grid">
              {#each candidates.vague as candidate}
                <button class="candidate-card vague" onclick={() => onChordSelect?.(candidate.name, candidate.frets)}>
                  <span class="candidate-name">{displayAccidental(candidate.name)}</span>
                  <ChordDiagram
                    voicing={fretsToVoicing(candidate.frets, selectedTuning.notes)}
                    tuning={selectedTuning}
                    chordName={candidate.name}
                  />
                </button>
              {/each}
            </div>
          {/if}

          {#if candidates.exact.length === 0 && candidates.vague.length === 0 && selectedPositions.length >= 2}
            <p class="info-msg" style="margin-top: 8px;">{t('identifier.noMatch')}</p>
          {/if}
        {/if}
      </div>
    {:else}
      {#if selectedPositions.length > 0}
        <div class="results-section">
          <p class="info-msg">
            {t('finder.selectedNotes')} <strong>{selectedNoteNames.map(n => displayAccidental(n)).join(', ')}</strong>
          </p>

          {#if candidates.exact.length > 0}
            <h3 class="results-heading">{t('identifier.matches')}</h3>
            <div class="candidate-grid">
              {#each candidates.exact as candidate}
                <button class="candidate-card" onclick={() => onChordSelect?.(candidate.name, candidate.frets)}>
                  <span class="candidate-name">{displayAccidental(candidate.name)}</span>
                  <ChordDiagram
                    voicing={fretsToVoicing(candidate.frets, selectedTuning.notes)}
                    tuning={selectedTuning}
                    chordName={candidate.name}
                  />
                </button>
              {/each}
            </div>
          {/if}

          {#if candidates.vague.length > 0}
            <h3 class="results-heading">{t('identifier.relatedChords')}</h3>
            <div class="candidate-grid">
              {#each candidates.vague as candidate}
                <button class="candidate-card vague" onclick={() => onChordSelect?.(candidate.name, candidate.frets)}>
                  <span class="candidate-name">{displayAccidental(candidate.name)}</span>
                  <ChordDiagram
                    voicing={fretsToVoicing(candidate.frets, selectedTuning.notes)}
                    tuning={selectedTuning}
                    chordName={candidate.name}
                  />
                </button>
              {/each}
            </div>
          {/if}

          {#if candidates.exact.length === 0 && candidates.vague.length === 0 && selectedPositions.length >= 2}
            <p class="info-msg" style="margin-top: 8px;">{t('identifier.noMatch')}</p>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .page-root {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: clip;
    overflow-x: visible;
  }

  .page-root > :global(.controls) {
    flex-shrink: 0;
    padding-right: 24px;
  }

  .page-root > :global(.info-msg) {
    flex-shrink: 0;
    padding-right: 24px;
  }

  .scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    margin-right: calc(-1 * var(--scroll-extend));
    padding-right: var(--scroll-extend);
  }

  .results-section {
    margin-top: 16px;
  }

  .results-heading {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    margin: 16px 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .candidate-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .candidate-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    cursor: pointer;
    transition: border-color 0.15s, filter 0.15s;
    font: inherit;
    color: inherit;
    min-width: 120px;
  }

  .candidate-card:hover {
    border-color: var(--accent);
    filter: brightness(1.1);
  }

  .candidate-card.vague {
    opacity: 0.7;
    border-style: dashed;
  }

  .candidate-card.vague:hover {
    opacity: 1;
  }

  .candidate-name {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 4px;
    color: var(--accent);
  }

  .mobile-id-layout {
    display: flex;
    flex-direction: row;
    gap: 24px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .mobile-id-layout .fretboard-container {
    flex-shrink: 0;
    overflow: hidden;
  }

  .mobile-id-layout .results-section {
    flex: 1;
    min-width: 200px;
    margin-top: 0;
  }

  .mobile-id-layout .candidate-grid {
    flex-wrap: wrap;
  }

  .mobile-id-layout .candidate-card {
    min-width: 0;
  }

  @media (max-width: 768px) {
    .page-root > :global(.controls) {
      padding-right: 10px;
    }
    .page-root > :global(.info-msg) {
      padding-right: 10px;
    }
  }
</style>
