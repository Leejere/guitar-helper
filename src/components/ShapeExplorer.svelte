<script lang="ts">
  import { displayAccidental } from '../lib/music';
  import {
    SHAPE_CONFIGS,
    getShapeVoicingsAtPosition,
    voicingToString,
    type CAGEDShape,
    type ShapeConfig,
    type ShapeVoicingResult,
    type Voicing,
  } from '../lib/voicings';
  import { STANDARD } from '../lib/tunings';
  import Fretboard from './Fretboard.svelte';
  import ChordDiagram from './ChordDiagram.svelte';
  import MiniChordDiagram from './MiniChordDiagram.svelte';
  import ButtonFilter from './ButtonFilter.svelte';
  import { responsive } from '../lib/responsive.svelte';

  // Fretboard layout constants (must match Fretboard.svelte defaults)
  const FB_LEFT_PADDING = 75;
  const FB_FRET_SPACING = 75;
  const FB_FRET_COUNT = 15;
  const FB_RIGHT_PADDING = 20;
  const FB_SVG_WIDTH = FB_LEFT_PADDING + (FB_FRET_COUNT + 1) * FB_FRET_SPACING + FB_RIGHT_PADDING;
  const needsVertical = $derived(responsive.windowWidth < FB_SVG_WIDTH + 60);
  const isTablet = $derived(needsVertical && responsive.windowWidth >= 768);

  function fretSelectorCenterX(fretNumber: number): number {
    const fret = Math.max(fretNumber, 0);
    return FB_LEFT_PADDING + fret * FB_FRET_SPACING - FB_FRET_SPACING / 2;
  }

  interface Props {
    onNavigateToChord?: (chordName: string) => void;
    initialShape?: CAGEDShape;
    initialPosition?: number;
    initialVariantIdx?: number;
  }

  let { onNavigateToChord, initialShape, initialPosition, initialVariantIdx }: Props = $props();

  const tuning = STANDARD;

  // --- Shape data grouped by family ---
  type ShapeGroup = { shape: CAGEDShape; configs: ShapeConfig[] };
  const shapeGroups: ShapeGroup[] = (() => {
    const map = new Map<CAGEDShape, ShapeConfig[]>();
    for (const c of SHAPE_CONFIGS) {
      if (!map.has(c.shape)) map.set(c.shape, []);
      map.get(c.shape)!.push(c);
    }
    const order: CAGEDShape[] = ['E', 'A', 'C', 'G', 'D', 'Dim'];
    return order.filter(s => map.has(s)).map(s => ({ shape: s, configs: map.get(s)! }));
  })();

  // Build variant label list for the sub-filter dropdown
  // Each entry: { label: "Em7", quality: "m7", configIdx, variantIdx }
  type VariantOption = { label: string; quality: string; displaySuffix: string };
  function getVariantOptions(shape: CAGEDShape | ''): VariantOption[] {
    if (!shape) return [];
    const group = shapeGroups.find(g => g.shape === shape);
    if (!group) return [];
    const opts: VariantOption[] = [];
    const seen = new Set<string>();
    for (const config of group.configs) {
      for (const [quality, displaySuffix] of config.variants) {
        const label = `${shape}${displaySuffix}`;
        if (!seen.has(label)) {
          seen.add(label);
          opts.push({ label, quality, displaySuffix });
        }
      }
    }
    return opts;
  }

  // --- Filter state ---
  let filterShape: CAGEDShape | '' = $state(initialShape ?? '');
  let filterVariants: string[] = $state([]); // displaySuffix values, empty = all
  let selectedPosition: number | null = $state(initialPosition ?? null);
  let selectedResultIdx: number | null = $state(initialVariantIdx ?? null);

  // Mobile view state
  let mobileView: 'fretboard' | 'detail' = $state('fretboard');

  let variantOptions = $derived(getVariantOptions(filterShape));

  // Active configs for the selected shape family
  let activeConfigs = $derived(
    filterShape ? shapeGroups.find(g => g.shape === filterShape)?.configs ?? [] : []
  );

  // --- Computed voicings at position ---
  let shapeResults: ShapeVoicingResult[] = $derived.by(() => {
    if (!filterShape || selectedPosition === null || activeConfigs.length === 0) return [];
    const all: ShapeVoicingResult[] = [];
    for (const config of activeConfigs) {
      all.push(...getShapeVoicingsAtPosition(config, selectedPosition, tuning.notes));
    }
    // Filter by variant if selected
    if (filterVariants.length > 0) {
      return all.filter(r => filterVariants.includes(r.displaySuffix));
    }
    return all;
  });

  let selectedResult = $derived(
    selectedResultIdx !== null && selectedResultIdx >= 0 && selectedResultIdx < shapeResults.length
      ? shapeResults[selectedResultIdx]
      : null
  );

  // Exact string+fret positions from all listed voicings (empty until a fret is selected)
  let positionDots = $derived.by(() => {
    if (selectedPosition === null || shapeResults.length === 0) return [] as { string: number; fret: number }[];
    const dots: { string: number; fret: number }[] = [];
    const seen = new Set<string>();
    for (const r of shapeResults) {
      for (let s = 0; s < r.voicing.frets.length; s++) {
        const f = r.voicing.frets[s];
        if (f < 0) continue;
        const key = `${s}:${f}`;
        if (!seen.has(key)) {
          seen.add(key);
          dots.push({ string: s, fret: f });
        }
      }
    }
    return dots;
  });

  let activeVoicingFrets = $derived(selectedResult?.voicing.frets ?? null);

  // --- Fret selector items: precompute voicings at all positions ---
  interface FretSelectorItem {
    position: number;
    bestVoicing: Voicing;
    chordNames: string[]; // unique chord names at this position
    count: number;
  }

  let fretSelectorItems: FretSelectorItem[] = $derived.by(() => {
    if (!filterShape || activeConfigs.length === 0) return [];
    const items: FretSelectorItem[] = [];
    for (let pos = 0; pos <= FB_FRET_COUNT; pos++) {
      const results: ShapeVoicingResult[] = [];
      for (const config of activeConfigs) {
        results.push(...getShapeVoicingsAtPosition(config, pos, tuning.notes));
      }
      // Apply variant filter
      const filtered = filterVariants.length > 0
        ? results.filter(r => filterVariants.includes(r.displaySuffix))
        : results;
      if (filtered.length === 0) continue;
      const nameSet = new Set<string>();
      for (const r of filtered) nameSet.add(displayAccidental(r.chordName));
      items.push({
        position: pos,
        bestVoicing: filtered[0].voicing,
        chordNames: [...nameSet],
        count: filtered.length,
      });
    }
    return items;
  });

  // --- Handlers ---
  function handleShapeChange(selected: string[]) {
    const val = (selected[0] ?? '') as CAGEDShape | '';
    filterShape = val;
    filterVariants = [];
    selectedPosition = null;
    selectedResultIdx = null;
    mobileView = 'fretboard';
  }

  function handleVariantChange(selected: string[]) {
    filterVariants = selected;
    selectedResultIdx = null;
  }

  function handleFretSelect(fret: number) {
    if (selectedPosition === fret) {
      selectedPosition = null;
      selectedResultIdx = null;
    } else {
      selectedPosition = fret;
      selectedResultIdx = null;
      if (needsVertical && !isTablet) mobileView = 'detail';
    }
  }

  function selectResult(idx: number) {
    selectedResultIdx = idx;
  }

  function fretLabel(v: Voicing): string {
    return voicingToString(v.frets);
  }

  // Handle initial navigation state
  $effect(() => {
    if (initialShape) {
      filterShape = initialShape;
      if (initialPosition !== undefined && initialPosition !== null) {
        selectedPosition = initialPosition;
        if (initialVariantIdx !== undefined && initialVariantIdx !== null) {
          selectedResultIdx = initialVariantIdx;
        }
      }
    }
  });

  // Auto-select first voicing when a position is selected
  $effect(() => {
    if (shapeResults.length > 0 && selectedResultIdx === null) {
      selectedResultIdx = 0;
    }
  });
</script>

<div class="shape-explorer page-root">
  <!-- Filters -->
  <div class="filter-bar">
    <ButtonFilter
      label="Shape"
      options={shapeGroups.map(g => ({ value: g.shape, label: `${g.shape} shape` }))}
      selected={filterShape ? [filterShape] : []}
      multiSelect={false}
      onchange={handleShapeChange}
    />
  </div>
  {#if filterShape && variantOptions.length > 1}
    <div class="filter-bar">
      <ButtonFilter
        label="Type"
        options={variantOptions.map(o => ({ value: o.displaySuffix, label: o.label }))}
        selected={filterVariants}
        onchange={handleVariantChange}
      />
    </div>
  {/if}

  {#if filterShape}
    <div class="explorer-scroll-area" class:tablet={isTablet}>
    {#snippet fretSelectorBtnContent(item: FretSelectorItem)}
      <span class="fret-selector-label">{item.position === 0 ? 'Open' : `Fret ${item.position}`}</span>
      <span class="fret-selector-main-name">{item.chordNames[0]}</span>
      <MiniChordDiagram voicing={item.bestVoicing} {tuning} />
      {#if item.chordNames.length > 1}
        <span class="fret-selector-names">
          {#each item.chordNames.slice(1, 4) as name}
            <span class="fret-selector-name">{name}</span>
          {/each}
          {#if item.chordNames.length > 4}
            <span class="fret-selector-name fret-selector-ellipsis">…</span>
          {/if}
        </span>
      {/if}
      <span class="fret-selector-count">{item.count} chord voicing{item.count !== 1 ? 's' : ''}</span>
    {/snippet}

    {#snippet mobileFretSelectorBtnContent(item: FretSelectorItem)}
      <MiniChordDiagram voicing={item.bestVoicing} {tuning} />
      <span class="mobile-selector-text">
        <span class="fret-selector-label">{item.position === 0 ? 'Open' : `Fret ${item.position}`}</span>
        <span class="fret-selector-main-name">{item.chordNames[0]}</span>
      </span>
      <span class="mobile-selector-text">
        {#if item.chordNames.length > 1}
          <span class="fret-selector-names">
            {#each item.chordNames.slice(1, 4) as name}
              <span class="fret-selector-name">{name}</span>
            {/each}
            {#if item.chordNames.length > 4}
              <span class="fret-selector-name fret-selector-ellipsis">…</span>
            {/if}
          </span>
        {/if}
        <span class="fret-selector-count">{item.count} chord voicing{item.count !== 1 ? 's' : ''}</span>
      </span>
    {/snippet}

    <!-- Fretboard section: hidden on phone detail view (tablet shows both) -->
    {#if !(needsVertical && !isTablet && mobileView === 'detail')}
      {#if needsVertical}
        <!-- Mobile: vertical fretboard + side selectors (single scroll container) -->
        <div class="mobile-fretboard-layout">
          <Fretboard
            {tuning}
            fretCount={15}
            mode="notes"
            leftPaddingOverride={FB_LEFT_PADDING}
            {positionDots}
            activeVoicing={activeVoicingFrets}
            rootNote={selectedResult?.rootNote}
            vertical={true}
          />
          {#if fretSelectorItems.length > 0}
            <div class="mobile-selector-col" style="height: {FB_SVG_WIDTH}px;">
              {#each fretSelectorItems as item}
                <div class="mobile-selector-slot" style="top: {fretSelectorCenterX(item.position)}px;">
                  <button
                    class="fret-selector-btn"
                    class:active={selectedPosition === item.position}
                    onclick={() => handleFretSelect(item.position)}
                  >
                    {@render mobileFretSelectorBtnContent(item)}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <!-- Desktop: horizontal fretboard + bottom selectors -->
        <div class="fretboard-container">
          <div class="fretboard-scroll">
            <Fretboard
              {tuning}
              fretCount={15}
              mode="notes"
              leftPaddingOverride={FB_LEFT_PADDING}
              {positionDots}
              activeVoicing={activeVoicingFrets}
              rootNote={selectedResult?.rootNote}
            />
            {#if fretSelectorItems.length > 0}
              <div class="fret-selector-row" style="width: {FB_SVG_WIDTH}px;">
                {#each fretSelectorItems as item}
                  <div class="fret-selector-slot" style="left: {fretSelectorCenterX(item.position)}px;">
                    <div class="fret-connector"></div>
                    <button
                      class="fret-selector-btn"
                      class:active={selectedPosition === item.position}
                      onclick={() => handleFretSelect(item.position)}
                    >
                      {@render fretSelectorBtnContent(item)}
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/if}

    <!-- Hint / info text (desktop only) -->
    {#if !needsVertical}
      <p class="fretboard-hint">
        {#if selectedPosition === null}
          Select a fret position above to see voicings.
        {:else if selectedResult}
          Showing <strong>{displayAccidental(selectedResult.chordName)}</strong> — {selectedResult.shapeLabel}
        {:else if shapeResults.length > 0}
          {shapeResults.length} chord voicing{shapeResults.length !== 1 ? 's' : ''} at {selectedPosition === 0 ? 'open position' : `fret ${selectedPosition}`}. Select one below.
        {/if}
      </p>
    {/if}

    <!-- Mobile back button -->
    {#if needsVertical && !isTablet && mobileView === 'detail'}
      <button class="mobile-back-btn" onclick={() => mobileView = 'fretboard'}>&larr; Back to fretboard</button>
    {/if}

    <!-- Detail section: always on desktop/tablet, only in detail view on phone -->
    {#if !(needsVertical && !isTablet && mobileView === 'fretboard') && shapeResults.length > 0}
      <div class="detail-column">
      <div class="section-title">
        <span>
          {shapeResults.length} chord voicing{shapeResults.length !== 1 ? 's' : ''} for <strong>{filterShape} shape</strong>
          {#if filterVariants.length > 0}
            ({filterVariants.map(v => variantOptions.find(o => o.displaySuffix === v)?.label ?? '').join(', ')})
          {/if}
          at {selectedPosition === 0 ? 'open position' : `fret ${selectedPosition}`}
        </span>
      </div>

      <div class="explorer-split">
        <div class="voicing-list">
          <div class="voicing-items">
            {#each shapeResults as result, idx}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="voicing-item"
                class:active={selectedResultIdx === idx}
                onclick={() => selectResult(idx)}
              >
                <span class="voicing-chord-name">
                  {#if onNavigateToChord}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      class="chord-link"
                      onclick={(e) => { e.stopPropagation(); onNavigateToChord?.(result.chordName); }}
                    >
                      {displayAccidental(result.chordName)}
                    </span>
                  {:else}
                    {displayAccidental(result.chordName)}
                  {/if}
                </span>
                <span class="voicing-frets">{fretLabel(result.voicing)}</span>
                <span class="voicing-tags">
                  <span class="tag tag-caged">{result.shapeLabel}</span>
                  {#if result.voicing.barres.length > 0}
                    <span class="tag tag-barre">Barre fret {result.voicing.barres[0].fret}</span>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <div class="voicing-detail">
          {#if selectedResult}
            <div class="detail-title">
              {displayAccidental(selectedResult.chordName)}
            </div>
            <div class="detail-tags">
              <span class="tag tag-pos">{selectedResult.voicing.positionGroup}</span>
              <span class="tag tag-caged">{selectedResult.shapeLabel}</span>
              {#if selectedResult.voicing.barres.length > 0}
                <span class="tag tag-barre">Barre fret {selectedResult.voicing.barres[0].fret}</span>
              {/if}
            </div>
            <ChordDiagram voicing={selectedResult.voicing} {tuning} chordName={selectedResult.chordName} />
            <div class="detail-notes">
              Notes: {selectedResult.voicing.pitchClasses.map(n => displayAccidental(n)).join(' ')}
            </div>
          {/if}
        </div>
      </div>
      </div>
    {/if}
    </div>
  {:else}
    <div class="empty-state">
      <p>Select a shape family above to start exploring voicings.</p>
    </div>
  {/if}
</div>

<style>
  /* Filter bar */
  .page-root {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .filter-bar {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
    margin-bottom: 12px;
    flex-shrink: 0;
    padding-right: 24px;
  }

  /* Fretboard */
  .fretboard-container {
    margin-top: 8px;
    padding-right: 24px;
  }

  .explorer-scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  .explorer-scroll-area.tablet {
    display: flex;
    flex-direction: row;
    gap: 24px;
    overflow: hidden;
  }

  .explorer-scroll-area.tablet .mobile-fretboard-layout {
    flex: 0 0 auto;
    margin-top: 0;
  }

  .explorer-scroll-area.tablet .detail-column {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  .explorer-scroll-area.tablet .explorer-split {
    flex-direction: column;
    margin-top: 0;
    padding-right: 0;
  }

  .explorer-scroll-area.tablet .section-title {
    flex-shrink: 0;
  }

  .explorer-scroll-area.tablet .voicing-detail {
    order: -1;
    position: static;
  }

  .fretboard-scroll {
    overflow-x: auto;
    overflow-y: hidden;
  }

  /* Fret selector row — positioned to align with fretboard */
  .fret-selector-row {
    position: relative;
    height: 155px;
    margin-top: 4px;
  }

  .fret-selector-slot {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .fret-connector {
    width: 2px;
    height: 10px;
    background: var(--text-muted);
    opacity: 0.3;
    border-radius: 1px;
  }

  .fret-selector-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 4px 6px 5px;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    width: 66px;
  }

  .fret-selector-btn:hover {
    border-color: var(--text-muted);
    background: var(--bg-card);
  }

  .fret-selector-btn.active {
    border-color: var(--accent);
    background: var(--bg-card);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .fret-selector-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }

  .fret-selector-btn.active .fret-selector-label {
    color: var(--accent);
  }

  .fret-selector-main-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
  }

  .fret-selector-names {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 64px;
  }

  .fret-selector-name {
    font-size: 7px;
    padding: 1px 3px;
    border-radius: 3px;
    background: var(--tag-caged-bg);
    color: var(--tag-caged);
    white-space: nowrap;
  }

  .fret-selector-ellipsis {
    background: none;
    color: var(--text-muted);
    padding: 1px 1px;
  }

  .fret-selector-count {
    font-size: 8px;
    color: var(--text-muted);
    opacity: 0.7;
  }

  .fretboard-hint {
    font-size: 12px;
    color: var(--text-muted);
    margin: 6px 0 10px 4px;
    opacity: 0.7;
    padding-right: 24px;
  }

  /* Section title */
  .section-title {
    font-size: 14px;
    margin-bottom: 10px;
    padding-right: 24px;
  }

  /* Split layout */
  .explorer-split {
    display: flex;
    gap: 24px;
    margin-top: 4px;
    align-items: flex-start;
    padding-right: 24px;
  }

  .voicing-list {
    flex: 1;
    min-width: 0;
  }

  .voicing-items {
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-secondary);
  }

  .voicing-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }

  .voicing-item:last-child {
    border-bottom: none;
  }

  .voicing-item:hover {
    background: var(--bg-card);
  }

  .voicing-item.active {
    background: var(--bg-card);
    border-left: 3px solid var(--accent);
  }

  .voicing-chord-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    min-width: 60px;
  }

  .chord-link {
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .chord-link:hover {
    opacity: 0.8;
  }

  .voicing-frets {
    font-family: monospace;
    font-size: 14px;
    letter-spacing: 1.5px;
    color: var(--text);
    font-weight: 600;
    min-width: 80px;
  }

  .voicing-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tag {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 8px;
    white-space: nowrap;
  }

  .tag-caged {
    background: var(--tag-caged-bg);
    color: var(--tag-caged);
    border: 1px solid var(--tag-caged-border);
  }

  .tag-pos {
    background: var(--tag-pos-bg);
    color: var(--tag-pos);
    border: 1px solid var(--tag-pos-border);
  }

  .tag-barre {
    background: var(--tag-barre-bg);
    color: var(--tag-barre);
    border: 1px solid var(--tag-barre-border);
  }

  /* Detail panel */
  .voicing-detail {
    flex: 0 0 180px;
    min-width: 180px;
    position: sticky;
    top: 16px;
  }

  .detail-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .detail-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .detail-tags .tag {
    font-size: 11px;
    padding: 2px 8px;
  }

  .detail-notes {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 10px;
  }

  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
  }

  @media (max-width: 700px) {
    .explorer-split {
      flex-direction: column;
      padding-right: 10px;
    }
    .voicing-detail {
      order: -1;
      position: static;
    }
    .filter-bar {
      padding-right: 10px;
    }
    .fretboard-container {
      padding-right: 10px;
    }
    .fretboard-hint {
      padding-right: 10px;
    }
    .mobile-back-btn {
      padding-right: 10px;
    }
  }

  /* Mobile fretboard layout */
  .mobile-fretboard-layout {
    display: flex;
    gap: 8px;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    min-height: 0;
    margin-top: 12px;
    padding-right: 12px;
  }

  .mobile-selector-col {
    position: relative;
    flex-shrink: 0;
    min-width: 130px;
  }

  .mobile-selector-slot {
    position: absolute;
    left: 0;
    transform: translateY(-50%);
  }

  .mobile-selector-col .fret-selector-btn {
    flex-direction: row;
    width: auto;
    height: 62px;
    padding: 3px 4px;
    gap: 3px;
    align-items: center;
  }

  .mobile-selector-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    min-width: 0;
  }

  .mobile-selector-col .fret-selector-label {
    font-size: 8px;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .mobile-selector-col .fret-selector-tags,
  .mobile-selector-col .fret-selector-names {
    flex-direction: row;
    flex-wrap: wrap;
    max-width: none;
    gap: 1px;
  }

  .mobile-selector-col .fret-selector-count {
    font-size: 7px;
  }

  .mobile-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    padding-right: 24px;
    margin-bottom: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .mobile-back-btn:hover {
    background: var(--bg-secondary);
  }
</style>
