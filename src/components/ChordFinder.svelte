<script lang="ts">
  import { getChord, displayAccidental, normalizeInput } from '../lib/music';
  import { findVoicings, voicingToString, type Voicing, type CAGEDShape } from '../lib/voicings';
  import { ALL_TUNINGS, STANDARD } from '../lib/tunings';
  import { filterChords, getChordDatabase, ALL_CATEGORIES, getAllKeys, FILTER_ROOTS, SCALE_MODES, type ChordEntry } from '../lib/chords';
  import { Note, Interval } from 'tonal';
  import { untrack } from 'svelte';
  import Fretboard from './Fretboard.svelte';
  import ChordDiagram from './ChordDiagram.svelte';
  import MiniChordDiagram from './MiniChordDiagram.svelte';
  import ButtonFilter from './ButtonFilter.svelte';
  import { responsive } from '../lib/responsive.svelte';

  // Fretboard layout constants (must match Fretboard.svelte non-compact mode)
  const FB_LEFT_PADDING = 75;
  const FB_FRET_SPACING = 75;
  const FB_FRET_COUNT = 15;
  const FB_RIGHT_PADDING = 20;
  const FB_SVG_WIDTH = FB_LEFT_PADDING + (FB_FRET_COUNT + 1) * FB_FRET_SPACING + FB_RIGHT_PADDING;
  const needsVertical = $derived(responsive.windowWidth < FB_SVG_WIDTH + 60);

  function fretSelectorCenterX(fretNumber: number): number {
    const fret = Math.max(fretNumber, 0);
    return FB_LEFT_PADDING + fret * FB_FRET_SPACING - FB_FRET_SPACING / 2;
  }

  interface Props {
    initialChord?: string;
    onNavigateToShape?: (shape: CAGEDShape, position: number, variantIdx?: number) => void;
  }

  let { initialChord, onNavigateToShape }: Props = $props();

  // --- Shared state ---
  let selectedTuning = $state(STANDARD);

  // --- Phase: 'browse' or 'voicings' ---
  let phase: 'browse' | 'voicings' = $state('browse');

  // --- Browse phase state ---
  let searchText = $state('');
  let filterRoots: string[] = $state([]);
  let filterKeys: string[] = $state([]);
  let filterCategories: string[] = $state([]);
  let filterVoicings: string[] = $state([]);
  let filterScaleRoot = $state('');
  let filterScaleMode = $state('');

  let filterScale = $derived(
    filterScaleRoot && filterScaleMode ? `${filterScaleRoot} ${filterScaleMode}` : ''
  );

  let filteredChordList = $derived(
    filterChords({ search: searchText, roots: filterRoots, keys: filterKeys, categories: filterCategories, voicings: filterVoicings, scale: filterScale })
  );

  const allKeys = getAllKeys();

  // --- Voicings phase state ---
  let activeChordSymbol = $state('');
  let voicings: Voicing[] = $state([]);
  let errorMsg = $state('');
  let selectedIdx: number | null = $state(null);
  let chordNotes: string[] = $state([]);
  let filterPositions: { string: number; fret: number }[] = $state([]);

  // New filter/sort state for voicing list
  let filterCaged: string[] = $state([]); // empty = all, or CAGED labels like ['E shape', 'Am7 shape']
  let collapsedGroups = $state(new Set<string>()); // collapsed position group labels

  // Fret selection: null = nothing selected (list hidden), 'all' = show all by playability, or position group string
  let selectedFretFilter: string | null = $state(null);

  // Mobile view state
  let mobileView: 'fretboard' | 'detail' = $state('fretboard');

  // Clear tone filter when position filter changes
  $effect(() => {
    selectedFretFilter; // track
    untrack(() => {
      filterPositions = [];
    });
  });

  // Valid clickable positions: tones present in voicings at current fret
  let clickablePositions = $derived.by(() => {
    if (!selectedFretFilter) return new Set<string>();
    const source = selectedFretFilter === 'all' ? voicings : voicings.filter(v => v.positionGroup === selectedFretFilter);
    const keys = new Set<string>();
    for (const v of source) {
      for (let s = 0; s < v.frets.length; s++) {
        if (v.frets[s] >= 0) {
          keys.add(`${s}:${v.frets[s]}`);
        }
      }
    }
    return keys;
  });

  // Quick chord search on voicings page
  let quickSearchText = $state('');
  let quickSearchFocused = $state(false);
  let quickSearchResults = $derived(
    quickSearchText.length >= 1
      ? filterChords({ search: quickSearchText }).slice(0, 12)
      : []
  );

  function quickSelectChord(symbol: string) {
    quickSearchText = '';
    quickSearchFocused = false;
    selectChord(symbol);
  }

  function handleQuickSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && quickSearchResults.length > 0) {
      quickSelectChord(quickSearchResults[0].symbol);
    } else if (e.key === 'Escape') {
      quickSearchText = '';
      quickSearchFocused = false;
      (e.target as HTMLInputElement).blur();
    }
  }

  function toggleGroup(label: string) {
    const next = new Set(collapsedGroups);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    collapsedGroups = next;
  }

  // Available position groups (derived from voicings)
  // Available CAGED labels (derived from voicings), grouped by shape
  let availableCaged = $derived.by(() => {
    const labels = new Set<string>();
    const labelToShape = new Map<string, string>();
    let hasOther = false;
    for (const v of voicings) {
      if (v.caged) {
        // Strip " var." suffix to group exact + variant under the base label
        const base = v.caged.label.replace(/ var\.$/, '');
        labels.add(base);
        labelToShape.set(base, v.caged.shape);
      } else {
        hasOther = true;
      }
    }
    // Sort: order by shape family, then by label within each shape
    const shapeOrder = ['E', 'A', 'D', 'C', 'G', 'Dim'];
    const result = [...labels].sort((a, b) => {
      const sa = shapeOrder.indexOf(labelToShape.get(a) ?? '');
      const sb = shapeOrder.indexOf(labelToShape.get(b) ?? '');
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b);
    });
    if (hasOther) result.push('Other');
    return result;
  });

  // Filtered voicings: apply fretboard note filter, fret selection, CAGED filter
  let filteredVoicings = $derived.by(() => {
    let list = voicings;
    if (filterPositions.length > 0) {
      list = list.filter(v =>
        filterPositions.every(fp => v.frets[fp.string] === fp.fret)
      );
    }
    if (selectedFretFilter && selectedFretFilter !== 'all') {
      list = list.filter(v => v.positionGroup === selectedFretFilter);
    }
    if (filterCaged.length > 0) {
      list = list.filter(v => {
        for (const fc of filterCaged) {
          if (fc === 'Other') {
            if (!v.caged) return true;
          } else {
            if (v.caged) {
              const base = v.caged.label.replace(/ var\.$/, '');
              if (base === fc) return true;
            }
          }
        }
        return false;
      });
    }
    return list;
  });

  // Fret selector items: one per position group, with its best voicing and labels
  interface FretSelectorItem {
    positionGroup: string;
    fretNumber: number; // -1 for open
    bestVoicing: Voicing;
    count: number;
    labels: string[]; // caged labels for this position
  }

  let fretSelectorItems: FretSelectorItem[] = $derived.by(() => {
    const groups = new Map<string, Voicing[]>();
    for (const v of voicings) {
      const key = v.positionGroup;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }
    const items: FretSelectorItem[] = [];
    for (const [posGroup, vList] of groups) {
      const sorted = [...vList].sort((a, b) => a.rank - b.rank);
      const fretNum = posGroup === 'Open position' ? -1 : parseInt(posGroup.replace('Fret ', ''));
      const labelSet = new Set<string>();
      for (const v of vList) {
        if (v.caged) {
          labelSet.add(v.caged.label.replace(/ var\.$/, ''));
        }
      }
      items.push({
        positionGroup: posGroup,
        fretNumber: fretNum,
        bestVoicing: sorted[0],
        count: vList.length,
        labels: [...labelSet],
      });
    }
    items.sort((a, b) => {
      if (a.fretNumber === -1) return -1;
      if (b.fretNumber === -1) return 1;
      return a.fretNumber - b.fretNumber;
    });
    return items;
  });

  interface VoicingGroup {
    label: string;
    items: { voicing: Voicing; origIdx: number }[];
  }

  // Grouped/sorted display list
  let displayGroups: VoicingGroup[] = $derived.by(() => {
    const items = filteredVoicings.map(v => ({
      voicing: v,
      origIdx: voicings.indexOf(v),
    }));

    if (selectedFretFilter === 'all') {
      // Flat list sorted by playability
      const sorted = [...items].sort((a, b) => a.voicing.rank - b.voicing.rank);
      return [{ label: '', items: sorted }];
    }

    // Group by position, each group internally sorted by score
    const groups = new Map<string, VoicingGroup>();
    for (const item of items) {
      const label = item.voicing.positionGroup;
      if (!groups.has(label)) {
        groups.set(label, { label, items: [] });
      }
      groups.get(label)!.items.push(item);
    }
    for (const g of groups.values()) {
      g.items.sort((a, b) => a.voicing.rank - b.voicing.rank);
    }
    return [...groups.values()].sort((a, b) => {
      if (a.label === 'Open position') return -1;
      if (b.label === 'Open position') return 1;
      const fa = parseInt(a.label.replace('Fret ', ''));
      const fb = parseInt(b.label.replace('Fret ', ''));
      return fa - fb;
    });
  });

  let selectedVoicing = $derived(selectedIdx !== null ? voicings[selectedIdx] : null);

  // Keep last valid voicing for fretboard display even when filters produce no results
  let lastActiveVoicing: number[] | null = $state(null);
  $effect(() => {
    if (selectedVoicing) {
      lastActiveVoicing = selectedVoicing.frets;
    }
  });
  let displayVoicing = $derived(selectedVoicing?.frets ?? lastActiveVoicing);

  let activeChordEntry = $derived.by(() => {
    if (!activeChordSymbol) return null;
    return getChordDatabase().find(e => e.symbol === activeChordSymbol) ?? null;
  });

  // --- Actions ---

  function handleTuningChange(e: Event) {
    const name = (e.target as HTMLSelectElement).value;
    selectedTuning = ALL_TUNINGS.find(t => t.name === name) ?? STANDARD;
    if (phase === 'voicings') {
      const entry = filteredChordList.find(e => e.symbol === activeChordSymbol);
      loadVoicings(activeChordSymbol, entry?.bassNote);
    }
  }

  function selectChord(symbol: string) {
    activeChordSymbol = symbol;
    // Look up the entry to get bassNote if it's a slash chord
    const entry = filteredChordList.find(e => e.symbol === symbol);
    loadVoicings(symbol, entry?.bassNote);
    phase = 'voicings';
  }

  function loadVoicings(symbol: string, bassNote?: string) {
    errorMsg = '';
    voicings = [];
    selectedIdx = null;
    lastActiveVoicing = null;
    chordNotes = [];
    filterPositions = [];
    selectedFretFilter = null;
    filterCaged = [];
    collapsedGroups = new Set();
    mobileView = 'fretboard';

    const input = normalizeInput(symbol);
    const chord = getChord(input);
    if (!chord || chord.empty || chord.notes.length === 0) {
      errorMsg = `Chord "${symbol}" not recognized.`;
      return;
    }

    chordNotes = chord.notes;
    const resolvedBass = bassNote ?? (chord.bass && chord.bass !== chord.tonic ? chord.bass : undefined);
    voicings = findVoicings(chord.notes, {
      tuning: selectedTuning.notes,
      maxFret: 15,
      maxSpan: 4,
      maxResults: 40,
      requiredBass: resolvedBass,
    });

    if (voicings.length === 0) {
      errorMsg = `No playable voicings found for "${displayAccidental(symbol)}" in ${selectedTuning.name} tuning.`;
    }
  }

  function goBack() {
    phase = 'browse';
    activeChordSymbol = '';
    voicings = [];
    errorMsg = '';
  }

  // When navigated to from ChordIdentifier, auto-select the chord
  $effect(() => {
    const chord = initialChord;
    if (chord) {
      untrack(() => {
        activeChordSymbol = chord;
        loadVoicings(chord);
        phase = 'voicings';
      });
    }
  });

  function selectVoicing(idx: number) {
    selectedIdx = idx;
  }

  function fretLabel(v: Voicing): string {
    return voicingToString(v.frets);
  }

  function positionLabel(v: Voicing): string {
    return v.positionGroup;
  }

  function cagedLabel(v: Voicing): string {
    if (!v.caged) return 'Other shape';
    return v.caged.label;
  }

  function filterNoteLabel(fp: { string: number; fret: number }): string {
    const note = Note.pitchClass(Note.transpose(selectedTuning.notes[fp.string], Interval.fromSemitones(fp.fret)));
    return fp.fret === 0 ? `${displayAccidental(note)} open` : `${displayAccidental(note)} (fret ${fp.fret})`;
  }

  function handleFretboardNoteClick(stringIdx: number, fret: number) {
    if (!selectedFretFilter) return;
    if (!clickablePositions.has(`${stringIdx}:${fret}`)) return;
    const idx = filterPositions.findIndex(p => p.string === stringIdx && p.fret === fret);
    if (idx >= 0) {
      // Clicking the same tone again removes it
      filterPositions = filterPositions.filter((_, i) => i !== idx);
    } else {
      // Replace any existing tone on the same string
      filterPositions = [...filterPositions.filter(p => p.string !== stringIdx), { string: stringIdx, fret: fret }];
    }
  }

  function clearFretboardFilters() {
    filterPositions = [];
  }

  // Auto-select first filtered voicing when filter changes (only after a position is selected)
  $effect(() => {
    const fv = filteredVoicings;
    untrack(() => {
      if (fv.length > 0 && selectedFretFilter) {
        if (selectedIdx === null || !fv.includes(voicings[selectedIdx!])) {
          selectedIdx = voicings.indexOf(fv[0]);
        }
      } else if (filterPositions.length > 0 || selectedFretFilter || filterCaged.length > 0) {
        selectedIdx = null;
      }
    });
  });

  function handleBrowseKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && filteredChordList.length > 0) {
      selectChord(filteredChordList[0].symbol);
    }
  }

  function clearBrowseFilters() {
    searchText = '';
    filterRoots = [];
    filterKeys = [];
    filterCategories = [];
    filterVoicings = [];
    filterScaleRoot = '';
    filterScaleMode = '';
  }

  const hasAnyBrowseFilter = $derived(
    searchText !== '' || filterRoots.length > 0 || filterKeys.length > 0 || filterCategories.length > 0 || filterVoicings.length > 0 || filterScaleRoot !== '' || filterScaleMode !== ''
  );

  function toggleFilter(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
  }

  function keyDisplayLabel(k: string): string {
    // "C" → "C major", "Cm" → "C minor"
    if (k.endsWith('m')) return displayAccidental(k.slice(0, -1)) + ' minor';
    return displayAccidental(k) + ' major';
  }
</script>

<div class="page-root">
  {#if phase === 'browse'}
    <!-- ============ CHORD BROWSER PHASE ============ -->
    <div class="browse-header no-print">
      <div class="browse-filters">
        <div class="filter-row">
          <label class="filter-label">Search</label>
          <div class="filter-options">
            <input
              id="chord-search"
              type="text"
              bind:value={searchText}
              onkeydown={handleBrowseKeydown}
              placeholder="Type chord name..."
              class="search-input"
            />
          </div>
        </div>

        <div class="filter-row">
          <label class="filter-label">Root</label>
          <div class="filter-options">
            {#each FILTER_ROOTS as r}
              <button
                class="filter-btn"
                class:active={filterRoots.includes(r)}
                onclick={() => filterRoots = toggleFilter(filterRoots, r)}
              >{displayAccidental(r)}</button>
            {/each}
            {#if filterRoots.length > 0}
              <button class="filter-row-clear" onclick={() => filterRoots = []}>&times;</button>
            {/if}
          </div>
        </div>

        <div class="filter-row">
          <label class="filter-label">Type</label>
          <div class="filter-options">
            {#each ALL_CATEGORIES as cat}
              <button
                class="filter-btn"
                class:active={filterCategories.includes(cat)}
                onclick={() => filterCategories = toggleFilter(filterCategories, cat)}
              >{cat}</button>
            {/each}
            {#if filterCategories.length > 0}
              <button class="filter-row-clear" onclick={() => filterCategories = []}>&times;</button>
            {/if}
          </div>
        </div>

        <div class="filter-row">
          <label class="filter-label">Key</label>
          <div class="filter-options">
            {#each allKeys as k}
              <button
                class="filter-btn"
                class:active={filterKeys.includes(k)}
                onclick={() => filterKeys = toggleFilter(filterKeys, k)}
              >{keyDisplayLabel(k)}</button>
            {/each}
            {#if filterKeys.length > 0}
              <button class="filter-row-clear" onclick={() => filterKeys = []}>&times;</button>
            {/if}
          </div>
        </div>

        <div class="filter-row">
          <label class="filter-label">Position</label>
          <div class="filter-options">
            <button
              class="filter-btn"
              class:active={filterVoicings.includes('root')}
              onclick={() => filterVoicings = toggleFilter(filterVoicings, 'root')}
            >Root position</button>
            <button
              class="filter-btn"
              class:active={filterVoicings.includes('slash')}
              onclick={() => filterVoicings = toggleFilter(filterVoicings, 'slash')}
            >Slash chords</button>
            {#if filterVoicings.length > 0}
              <button class="filter-row-clear" onclick={() => filterVoicings = []}>&times;</button>
            {/if}
          </div>
        </div>

        <div class="filter-row">
          <label class="filter-label">Scale</label>
          <div class="filter-options">
            <div class="filter-options-sub">
              <span class="filter-sublabel">Root</span>
              {#each FILTER_ROOTS as r}
                <button
                  class="filter-btn"
                  class:active={filterScaleRoot === r}
                  onclick={() => filterScaleRoot = filterScaleRoot === r ? '' : r}
                >{displayAccidental(r)}</button>
              {/each}
            </div>
            {#if filterScaleRoot}
              <div class="filter-options-sub">
                <span class="filter-sublabel">Mode</span>
                {#each SCALE_MODES as mode}
                  <button
                    class="filter-btn"
                    class:active={filterScaleMode === mode}
                    onclick={() => filterScaleMode = filterScaleMode === mode ? '' : mode}
                  >{mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
                {/each}
              </div>
            {/if}
            {#if filterScaleRoot || filterScaleMode}
              <button class="filter-row-clear" onclick={() => { filterScaleRoot = ''; filterScaleMode = ''; }}>&times;</button>
            {/if}
          </div>
        </div>

        <button class="btn btn-secondary btn-clear-all" class:invisible={!hasAnyBrowseFilter} onclick={clearBrowseFilters}>Clear All Filters</button>
      </div>
    </div>

    <div class="chord-count">{filteredChordList.length} chord{filteredChordList.length !== 1 ? 's' : ''}</div>

    <div class="chord-grid">
      {#each filteredChordList as entry}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="chord-card" onclick={() => selectChord(entry.symbol)}>
          <span class="chord-card-name">{displayAccidental(entry.symbol)}</span>
          <span class="chord-card-type">{entry.typeName}</span>
          {#if entry.keys.length > 0}
            <span class="chord-card-keys">{entry.keys.slice(0, 3).map(k => displayAccidental(k)).join(', ')}{entry.keys.length > 3 ? ', ...' : ''}</span>
          {/if}
        </div>
      {/each}
    </div>

    {#if filteredChordList.length === 0}
      <p class="no-match-msg">No chords match the current filters.</p>
    {/if}

  {:else}
    <!-- ============ VOICINGS PHASE ============ -->
    <div class="controls no-print">
      <button class="btn btn-secondary btn-back" onclick={goBack}>&larr; Back to chords</button>

      <div class="control-group quick-search-group">
        <label for="quick-chord-search">Switch chord</label>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="quick-search-wrapper" onkeydown={handleQuickSearchKeydown}>
          <input
            id="quick-chord-search"
            type="text"
            bind:value={quickSearchText}
            onfocus={() => { quickSearchFocused = true; }}
            onblur={() => { setTimeout(() => { quickSearchFocused = false; }, 150); }}
            placeholder="Type chord..."
            class="search-input"
            autocomplete="off"
          />
          {#if quickSearchFocused && quickSearchResults.length > 0}
            <div class="quick-search-dropdown">
              {#each quickSearchResults as entry}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="quick-search-item" onmousedown={() => quickSelectChord(entry.symbol)}>
                  <span class="quick-search-name">{displayAccidental(entry.symbol)}</span>
                  <span class="quick-search-type">{entry.typeName}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="control-group">
        <label for="tuning-chord2">Tuning</label>
        <select id="tuning-chord2" value={selectedTuning.name} onchange={handleTuningChange}>
          {#each ALL_TUNINGS as t}
            <option value={t.name}>{t.name}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if errorMsg}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    {#if voicings.length > 0}
      {#if activeChordEntry}
        <div class="chord-info-bar">
          <span class="chord-info-name">{displayAccidental(activeChordEntry.symbol)}</span>
          {#if chordNotes.length > 0}
            <span class="chord-notes">({chordNotes.map(n => displayAccidental(n)).join(' · ')})</span>
          {/if}
          <span class="chord-info-type">{activeChordEntry.typeName}</span>
          <span class="chord-info-category">{activeChordEntry.category}</span>
          {#if activeChordEntry.keys.length > 0}
            <span class="chord-info-keys">Keys: {activeChordEntry.keys.map(k => displayAccidental(k)).join(', ')}</span>
          {/if}
        </div>
      {/if}

      <div class="voicings-scroll-area">
      {#snippet fretSelectorBtnContent(item: FretSelectorItem)}
        <span class="fret-selector-label">{item.positionGroup === 'Open position' ? 'Open' : `Fret ${item.fretNumber}`}</span>
        <MiniChordDiagram voicing={item.bestVoicing} tuning={selectedTuning} />
        <span class="fret-selector-tags">
          {#each item.labels.slice(0, 2) as lbl}
            <span class="fret-selector-tag">{lbl}</span>
          {/each}
          {#if item.labels.length > 2}
            <span class="fret-selector-tag">+{item.labels.length - 2}</span>
          {/if}
        </span>
        <span class="fret-selector-count">{item.count} voicing{item.count !== 1 ? 's' : ''}</span>
      {/snippet}

      {#snippet mobileFretSelectorBtnContent(item: FretSelectorItem)}
        <MiniChordDiagram voicing={item.bestVoicing} tuning={selectedTuning} />
        <span class="mobile-selector-text">
          <span class="fret-selector-label">{item.positionGroup === 'Open position' ? 'Open' : `Fret ${item.fretNumber}`}</span>
          <span class="fret-selector-tags">
            {#each item.labels.slice(0, 2) as lbl}
              <span class="fret-selector-tag">{lbl}</span>
            {/each}
            {#if item.labels.length > 2}
              <span class="fret-selector-tag">+{item.labels.length - 2}</span>
            {/if}
          </span>
          <span class="fret-selector-count">{item.count} voicing{item.count !== 1 ? 's' : ''}</span>
        </span>
      {/snippet}

      <!-- Fretboard section: hidden on mobile detail view -->
      {#if !(needsVertical && mobileView === 'detail')}
        {#if needsVertical}
          <!-- Mobile: vertical fretboard + side selectors (single scroll container) -->
          <div class="mobile-fretboard-layout">
            <Fretboard
              tuning={selectedTuning}
              fretCount={15}
              mode="notes"
              leftPaddingOverride={FB_LEFT_PADDING}
              highlightNotes={chordNotes}
              activeVoicing={displayVoicing}
              dimHighlights={!selectedFretFilter}
              vertical={true}
            />
            <div class="mobile-selector-col" style="height: {FB_SVG_WIDTH}px;">
              {#each fretSelectorItems as item}
                <div class="mobile-selector-slot" style="top: {fretSelectorCenterX(item.fretNumber)}px;">
                  <button
                    class="fret-selector-btn"
                    class:active={selectedFretFilter === item.positionGroup}
                    onclick={() => { selectedFretFilter = selectedFretFilter === item.positionGroup ? null : item.positionGroup; mobileView = 'detail'; }}
                  >
                    {@render mobileFretSelectorBtnContent(item)}
                  </button>
                </div>
              {/each}
              <div class="mobile-selector-slot" style="top: {FB_SVG_WIDTH - 50}px;">
                <button
                  class="fret-selector-btn fret-selector-all"
                  class:active={selectedFretFilter === 'all'}
                  onclick={() => { selectedFretFilter = selectedFretFilter === 'all' ? null : 'all'; mobileView = 'detail'; }}
                >
                  <span class="mobile-selector-text">
                    <span class="fret-selector-label">All</span>
                    <span class="fret-selector-all-desc">Sorted by playability</span>
                    <span class="fret-selector-count">{voicings.length} voicing{voicings.length !== 1 ? 's' : ''}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        {:else}
          <!-- Desktop: horizontal fretboard + bottom selectors -->
          <div class="fretboard-container">
            <div class="fretboard-scroll">
              <Fretboard
                tuning={selectedTuning}
                fretCount={15}
                mode="notes"
                leftPaddingOverride={FB_LEFT_PADDING}
                highlightNotes={chordNotes}
                activeVoicing={displayVoicing}
                onNoteClick={handleFretboardNoteClick}
                filterPositions={filterPositions}
                clickableNotes={selectedFretFilter ? clickablePositions : undefined}
                dimHighlights={!selectedFretFilter}
              />
              <!-- Fret selector buttons aligned to fretboard positions -->
              <div class="fret-selector-row no-print" style="width: {FB_SVG_WIDTH}px;">
                {#each fretSelectorItems as item}
                  <div class="fret-selector-slot" style="left: {fretSelectorCenterX(item.fretNumber)}px;">
                    <div class="fret-connector"></div>
                    <button
                      class="fret-selector-btn"
                      class:active={selectedFretFilter === item.positionGroup}
                      onclick={() => { selectedFretFilter = selectedFretFilter === item.positionGroup ? null : item.positionGroup; }}
                    >
                      {@render fretSelectorBtnContent(item)}
                    </button>
                  </div>
                {/each}
                <div class="fret-selector-slot fret-selector-all-slot" style="left: {FB_SVG_WIDTH - 50}px;">
                  <button
                    class="fret-selector-btn fret-selector-all"
                    class:active={selectedFretFilter === 'all'}
                    onclick={() => { selectedFretFilter = selectedFretFilter === 'all' ? null : 'all'; }}
                  >
                    <span class="fret-selector-label">All</span>
                    <span class="fret-selector-all-desc">Sorted by playability</span>
                    <span class="fret-selector-count">{voicings.length} voicing{voicings.length !== 1 ? 's' : ''}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {#if selectedFretFilter}
            <p class="fretboard-hint no-print">Click chord tones on the fretboard to filter voicings</p>
          {/if}

          {#if filterPositions.length > 0}
            <div class="filter-info no-print">
              {#each filterPositions as fp, i}
                <span class="filter-tag">
                  {filterNoteLabel(fp)}
                  <button class="filter-tag-x" onclick={() => { filterPositions = filterPositions.filter((_, j) => j !== i); }}>&times;</button>
                </span>
              {/each}
              <button class="btn-clear-filter" onclick={clearFretboardFilters}>Clear all</button>
            </div>
          {/if}
        {/if}
      {/if}

      <!-- Detail section: on mobile only in detail view; on desktop when fret selected -->
      {#if needsVertical && mobileView === 'detail'}
        <button class="mobile-back-btn" onclick={() => mobileView = 'fretboard'}>&larr; Back to fretboard</button>
      {/if}

      {#if !(needsVertical && mobileView === 'fretboard') && selectedFretFilter}
      <div class="finder-split">
        <div class="voicing-list">
          <!-- Shape filter -->
          {#if availableCaged.length > 0}
            <div class="voicing-toolbar no-print">
              <ButtonFilter
                label="Shape"
                options={availableCaged.map(l => ({ value: l, label: l === 'Other' ? 'Other shape' : l }))}
                selected={filterCaged}
                onchange={(v) => filterCaged = v}
              />
            </div>
          {/if}

          <div class="section-title">
            <div class="section-title-row">
              <span>
                {filteredVoicings.length} voicing{filteredVoicings.length !== 1 ? 's' : ''} filtered
              </span>
            </div>
          </div>

          {#if filteredVoicings.length === 0 && (filterPositions.length > 0 || selectedFretFilter || filterCaged.length > 0)}
            <div class="no-match-msg">No voicings match the current filters.</div>
          {/if}
          <div class="voicing-items">
            {#each displayGroups as group}
              {#if group.label}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="position-group-header" onclick={() => toggleGroup(group.label)}>
                  <span class="group-chevron" class:collapsed={collapsedGroups.has(group.label)}>&#9662;</span>
                  {group.label} <span class="group-count">({group.items.length})</span>
                </div>
              {/if}
              {#if !group.label || !collapsedGroups.has(group.label)}
              {#each group.items as { voicing: v, origIdx }}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="voicing-item"
                  class:active={selectedIdx === origIdx}
                  onclick={() => selectVoicing(origIdx)}
                >
                  <span class="voicing-frets">{fretLabel(v)}</span>
                  <span class="voicing-tags">
                    {#if v.caged}
                      {#if onNavigateToShape}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span class="tag tag-caged tag-clickable" onclick={(e) => { e.stopPropagation(); onNavigateToShape?.(v.caged!.shape, v.caged!.position); }}>{v.caged.label}</span>
                      {:else}
                        <span class="tag tag-caged">{v.caged.label}</span>
                      {/if}
                    {:else}
                      <span class="tag tag-other">Other shape</span>
                    {/if}
                    {#if selectedFretFilter === 'all'}
                      <span class="tag tag-pos">{positionLabel(v)}</span>
                    {/if}
                    {#if v.barres.length > 0}
                      <span class="tag tag-barre">Barre fret {v.barres[0].fret}</span>
                    {/if}
                  </span>
                  <span class="voicing-score" title="Playability ranking">Ranked {v.rank}/{voicings.length}</span>
                </div>
              {/each}
              {/if}
            {/each}
          </div>
        </div>

        <div class="voicing-detail">
          {#if selectedVoicing}
            <div class="section-title">
              {fretLabel(selectedVoicing)}
              <span class="detail-score" title="Playability ranking">Ranked {selectedVoicing.rank}/{voicings.length}</span>
            </div>
            <div class="detail-tags">
              <span class="tag tag-pos">{positionLabel(selectedVoicing)}</span>
              {#if selectedVoicing.caged}
                {#if onNavigateToShape}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span class="tag tag-caged tag-clickable" onclick={() => onNavigateToShape?.(selectedVoicing!.caged!.shape, selectedVoicing!.caged!.position)}>{cagedLabel(selectedVoicing)}</span>
                {:else}
                  <span class="tag tag-caged">{cagedLabel(selectedVoicing)}</span>
                {/if}
              {:else}
                <span class="tag tag-other">Other shape</span>
              {/if}
              {#if selectedVoicing.barres.length > 0}
                <span class="tag tag-barre">Barre fret {selectedVoicing.barres[0].fret}</span>
              {/if}
            </div>
            <ChordDiagram voicing={selectedVoicing} tuning={selectedTuning} chordName={activeChordSymbol} />
          {/if}
        </div>
      </div>
      {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page-root {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .page-root > :global(.controls) {
    flex-shrink: 0;
    padding-right: 24px;
  }

  .page-root > :global(.info-msg) {
    flex-shrink: 0;
    padding-right: 24px;
  }

  .fretboard-container {
    padding-right: 24px;
  }

  .voicings-scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  .no-match-msg-browse {
    flex-shrink: 0;
    padding-right: 24px;
  }

  .mobile-back-btn {
    flex-shrink: 0;
    padding-right: 24px;
  }

  /* === Browse phase === */
  .browse-header {
    margin-bottom: 12px;
    flex-shrink: 0;
    padding-right: 24px;
  }

  .browse-filters {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .filter-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    min-width: 60px;
    flex-shrink: 0;
    padding-top: 5px;
  }

  .filter-options {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: flex-start;
  }

  .filter-options-sub {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    width: 100%;
  }

  .filter-sublabel {
    font-size: 11px;
    color: var(--text-muted);
    opacity: 0.6;
    min-width: 36px;
  }

  .filter-btn {
    padding: 4px 10px;
    font-size: 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg-secondary);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .filter-btn:hover {
    border-color: var(--accent);
    color: var(--text);
  }

  .filter-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }

  .filter-row-clear {
    flex-shrink: 0;
    padding: 2px 8px;
    font-size: 16px;
    line-height: 1;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .filter-row-clear:hover {
    opacity: 1;
    color: var(--accent);
  }

  .btn-clear-all.invisible {
    visibility: hidden;
  }

  .search-group {
    flex: 1;
    min-width: 160px;
  }

  .search-input {
    width: 100%;
    max-width: 240px;
  }

  /* Quick search on voicings page */
  .quick-search-group {
    flex: 0 1 180px;
    min-width: 120px;
  }

  .quick-search-wrapper {
    position: relative;
  }

  .quick-search-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    min-width: 220px;
    max-height: 320px;
    overflow-y: auto;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 100;
    margin-top: 4px;
  }

  .quick-search-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .quick-search-item:hover {
    background: var(--bg-secondary);
  }

  .quick-search-name {
    font-weight: 600;
    color: var(--text);
    font-size: 13px;
  }

  .quick-search-type {
    font-size: 11px;
    color: var(--text-muted);
  }

  .chord-count {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 10px;
    flex-shrink: 0;
    padding-right: 24px;
  }

  .chord-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 2px;
    padding-right: 24px;
    align-content: start;
  }

  .chord-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .chord-card:hover {
    background: var(--bg-card);
    border-color: var(--accent);
  }

  .chord-card-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }

  .chord-card-type {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chord-card-keys {
    font-size: 10px;
    color: var(--accent);
    opacity: 0.7;
    margin-top: 2px;
  }

  /* === Voicings phase === */
  .btn-back {
    font-size: 13px;
    padding: 6px 14px;
  }

  .btn-clear-all {
    font-size: 12px;
    padding: 6px 14px;
    align-self: flex-end;
  }

  .finder-split {
    display: flex;
    gap: 24px;
    margin-top: 20px;
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

  .position-group-header {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--accent);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
  }

  .position-group-header:hover {
    background: var(--bg-card);
  }

  .group-chevron {
    display: inline-block;
    transition: transform 0.15s;
    margin-right: 4px;
    font-size: 10px;
  }

  .group-chevron.collapsed {
    transform: rotate(-90deg);
  }

  .group-count {
    font-weight: 400;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
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

  .fret-selector-tags {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 64px;
  }

  .fret-selector-tag {
    font-size: 7px;
    padding: 1px 3px;
    border-radius: 3px;
    background: var(--tag-caged-bg);
    color: var(--tag-caged);
    white-space: nowrap;
  }

  .fret-selector-count {
    font-size: 8px;
    color: var(--text-muted);
    opacity: 0.7;
  }

  .fret-selector-all-slot .fret-connector {
    visibility: hidden;
  }

  .fret-selector-all {
    justify-content: center;
  }

  .fret-selector-all-desc {
    font-size: 8px;
    color: var(--text-muted);
    text-align: center;
    white-space: normal;
    line-height: 1.2;
  }

  /* Voicing toolbar */
  .voicing-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .toolbar-filters {
    display: flex;
    gap: 6px;
  }

  .toolbar-select {
    font-size: 12px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text);
  }

  /* Tags */
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

  .tag-clickable {
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .tag-clickable:hover {
    opacity: 0.8;
  }

  .tag-other {
    background: var(--tag-other-bg);
    color: var(--tag-other);
    border: 1px solid var(--tag-other-border);
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

  .voicing-score {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    margin-left: auto;
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    min-width: 7em;
    text-align: left;
    opacity: 0.7;
  }

  .detail-score {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    margin-left: 8px;
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

  .voicing-frets {
    font-family: monospace;
    font-size: 14px;
    letter-spacing: 1.5px;
    color: var(--text);
    font-weight: 600;
    min-width: 80px;
  }

  .voicing-detail {
    flex: 0 0 180px;
    min-width: 180px;
    position: sticky;
    top: 16px;
  }

  .fretboard-hint {
    font-size: 12px;
    color: var(--text-muted);
    margin: 6px 0 0 4px;
    opacity: 0.7;
    flex-shrink: 0;
    padding-right: 24px;
  }

  .chord-info-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 16px;
    padding: 10px 14px;
    margin: 8px 0 4px;
    background: var(--bg-card);
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.5;
    flex-shrink: 0;
    margin-right: 24px;
  }
  .chord-info-name {
    font-size: 18px;
    font-weight: 700;
  }
  .chord-info-type {
    color: var(--text-muted);
  }
  .chord-info-category {
    background: var(--accent);
    color: var(--bg);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .chord-info-keys {
    color: var(--text-muted);
    font-size: 13px;
  }

  .chord-notes {
    font-weight: 400;
    color: var(--text-muted);
    margin-left: 6px;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .filter-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    flex-shrink: 0;
    padding-right: 24px;
  }

  .filter-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--tag-pos-bg);
    border: 1px solid var(--tag-pos-border);
    color: var(--highlight);
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 12px;
  }

  .filter-tag-x {
    background: none;
    border: none;
    color: var(--highlight);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
  }

  .filter-tag-x:hover {
    color: var(--text);
  }

  .btn-clear-filter {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 12px;
    cursor: pointer;
  }

  .btn-clear-filter:hover {
    color: var(--text);
    border-color: var(--text-muted);
  }

  .no-match-msg {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-secondary);
    margin-bottom: 8px;
  }

  @media (max-width: 700px) {
    .finder-split {
      flex-direction: column;
      padding-right: 10px;
    }
    .voicing-detail {
      order: -1;
      position: static;
    }
    .chord-grid {
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      padding-right: 10px;
    }
    .browse-header {
      padding-right: 10px;
    }
    .chord-count {
      padding-right: 10px;
    }
    .chord-info-bar {
      margin-right: 10px;
    }
    .fretboard-hint {
      padding-right: 10px;
    }
    .filter-info {
      padding-right: 10px;
    }
    .page-root > :global(.controls) {
      padding-right: 10px;
    }
    .page-root > :global(.info-msg) {
      padding-right: 10px;
    }
    .fretboard-container {
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

  .mobile-selector-col .fret-selector-all {
    flex-direction: row;
    height: 62px;
    align-items: center;
  }

  .mobile-selector-col .fret-selector-all-desc {
    font-size: 7px;
  }

  .mobile-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
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
