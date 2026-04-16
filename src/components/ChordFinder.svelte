<script lang="ts">
  import { getChord, displayAccidental, normalizeInput, getIntervalLabel, fretsToVoicing } from '../lib/music';
  import { findVoicings, voicingToString, classifyCAGED, type Voicing, type CAGEDShape } from '../lib/voicings';
  import { ALL_TUNINGS, STANDARD } from '../lib/tunings';
  import { filterChords, getChordDatabase, ALL_CATEGORIES, FILTER_ROOTS, SCALE_MODES, getScaleChordsByDegree, getRelatedChords, type ChordEntry, type ScaleDegreeGroup } from '../lib/chords';
  import { Note, Interval } from 'tonal';
  import { untrack, tick } from 'svelte';
  import Fretboard from './Fretboard.svelte';
  import ChordDiagram from './ChordDiagram.svelte';
  import MiniChordDiagram from './MiniChordDiagram.svelte';
  import ButtonFilter from './ButtonFilter.svelte';
  import { responsive } from '../lib/responsive.svelte';
  import { chordFinderState as cfs } from '../lib/chord-finder-state.svelte';
  import { pool } from '../lib/pool.svelte';
  import { progression } from '../lib/progression.svelte';
  import { toast } from '../lib/toast.svelte';
  import { t, tc, tMode, tCategory, tRelation, tTuning, tShapeLabel, tPosition, tTypeName, tFunctionName } from '../lib/i18n.svelte';

  // Fretboard layout constants (must match Fretboard.svelte non-compact mode)
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
    initialChord?: string;
    initialFrets?: number[];
    onNavigateToShape?: (shape: CAGEDShape, position: number, variantIdx?: number) => void;
  }

  let { initialChord, initialFrets, onNavigateToShape }: Props = $props();

  // --- Shared state (persisted via singleton) ---
  let selectedTuning = $state(cfs.selectedTuning);

  // --- Phase: 'browse' or 'voicings' ---
  let phase: 'browse' | 'voicings' = $state(cfs.phase);

  // --- Browse phase state ---
  let searchText = $state(cfs.searchText);
  let filterRoots: string[] = $state([...cfs.filterRoots]);
  let filterCategories: string[] = $state([...cfs.filterCategories]);
  let filterScaleRoot = $state(cfs.filterScaleRoot);
  let filterScaleMode = $state(cfs.filterScaleMode);
  let filterSlashBass = $state(cfs.filterSlashBass);

  let filterScale = $derived(
    filterScaleRoot && filterScaleMode ? `${filterScaleRoot} ${filterScaleMode}` : ''
  );

  let filteredChordList = $derived(
    filterChords({ search: searchText, roots: filterRoots, categories: filterCategories, scale: filterScale, slashBass: filterSlashBass })
  );

  let scaleDegreeGroups = $derived.by(() => {
    if (!filterScale) return [];
    const groups = getScaleChordsByDegree(filterScale);
    if (!groups) return [];
    const ext = includeExtensions;
    return groups
      .map(g => ({
        ...g,
        chords: filteredChordList
          .filter(e => {
            const base = e.bassNote ? e.symbol.split('/')[0] : e.symbol;
            if (!g.symbols.has(e.symbol) && !g.symbols.has(base)) return false;
            // When extensions are off, only show triads
            if (!ext && !g.triadSymbols.has(base) && !g.triadSymbols.has(e.symbol)) return false;
            return true;
          })
          .sort((a, b) => {
            const aBase = a.bassNote ? a.symbol.split('/')[0] : a.symbol;
            const bBase = b.bassNote ? b.symbol.split('/')[0] : b.symbol;
            const aTriad = g.triadSymbols.has(aBase);
            const bTriad = g.triadSymbols.has(bBase);
            if (aTriad && !bTriad) return -1;
            if (!aTriad && bTriad) return 1;
            return 0;
          }),
      }))
      .filter(g => g.chords.length > 0);
  });



  // --- Voicings phase state ---
  let activeChordSymbol = $state(cfs.activeChordSymbol);
  let voicings: Voicing[] = $state([]);
  let otherVoicings: Voicing[] = $state([]);
  let errorMsg = $state('');
  let selectedIdx: number | null = $state(cfs.selectedIdx);
  let chordNotes: string[] = $state([]);
  let chordRoot: string | null = $state(null);
  let filterPositions: { string: number; fret: number }[] = $state([]);

  // New filter/sort state for voicing list
  let filterCaged: string[] = $state([]); // empty = all, or CAGED labels like ['E shape', 'Am7 shape']
  let collapsedGroups = $state(new Set<string>(['__others__'])); // collapsed position group labels

  // Fret selection: null = nothing selected (list hidden), 'all' = show all by playability, or position group string
  let selectedFretFilter: string | null = $state(cfs.selectedFretFilter);

  // Mobile view state
  let mobileView: 'fretboard' | 'detail' = $state('fretboard');

  // Intervals toggle
  let showIntervals = $state(cfs.showIntervals);

  // Extensions toggle for scale filter
  let includeExtensions = $state(cfs.includeExtensions);

  // Auto-persist browse/voicing state
  $effect(() => {
    cfs.selectedTuning = selectedTuning;
    cfs.phase = phase;
    cfs.searchText = searchText;
    cfs.filterRoots = filterRoots;
    cfs.filterCategories = filterCategories;
    cfs.filterScaleRoot = filterScaleRoot;
    cfs.filterScaleMode = filterScaleMode;
    cfs.filterSlashBass = filterSlashBass;
    cfs.activeChordSymbol = activeChordSymbol;
    cfs.showIntervals = showIntervals;
    cfs.includeExtensions = includeExtensions;
    cfs.selectedFretFilter = selectedFretFilter;
    cfs.selectedIdx = selectedIdx;
    cfs.persist();
  });

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
      ? filterChords({ search: quickSearchText, roots: [], categories: [], scale: '', slashBass: '' }).slice(0, 12)
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

  // Filter other voicings by the same fret selection
  let filteredOtherVoicings = $derived.by(() => {
    if (!selectedFretFilter) return [];
    let list = otherVoicings;
    if (selectedFretFilter !== 'all') {
      list = list.filter(v => v.positionGroup === selectedFretFilter);
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

  let selectedVoicing = $derived.by(() => {
    if (selectedIdx === null) return null;
    if (selectedIdx < voicings.length) return voicings[selectedIdx];
    return otherVoicings[selectedIdx - voicings.length] ?? null;
  });
  let selectedIsOther = $derived(selectedIdx !== null && selectedIdx >= voicings.length);

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

  // Related chords for the active chord
  const RELATED_INLINE_MAX = 4;
  let relatedChords = $derived(activeChordSymbol ? getRelatedChords(activeChordSymbol) : []);
  let relatedInline = $derived(relatedChords.slice(0, RELATED_INLINE_MAX));
  let relatedOverflow = $derived(relatedChords.slice(RELATED_INLINE_MAX));
  let relatedMoreOpen = $state(false);

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
    relatedMoreOpen = false;
    activeChordSymbol = symbol;
    // Look up the entry to get bassNote if it's a slash chord
    const entry = filteredChordList.find(e => e.symbol === symbol);
    loadVoicings(symbol, entry?.bassNote);
    phase = 'voicings';
  }

  function loadVoicings(symbol: string, bassNote?: string) {
    errorMsg = '';
    voicings = [];
    otherVoicings = [];
    selectedIdx = null;
    lastActiveVoicing = null;
    chordNotes = [];
    chordRoot = null;
    filterPositions = [];
    selectedFretFilter = null;
    filterCaged = [];
    collapsedGroups = new Set(['__others__']);
    mobileView = 'fretboard';

    const input = normalizeInput(symbol);
    const chord = getChord(input);
    if (!chord || chord.empty || chord.notes.length === 0) {
      errorMsg = t('finder.chordNotRecognized', symbol);
      return;
    }

    chordNotes = chord.notes;
    chordRoot = chord.tonic || null;
    const resolvedBass = bassNote ?? (chord.bass && chord.bass !== chord.tonic ? chord.bass : undefined);
    const others: Voicing[] = [];
    voicings = findVoicings(chord.notes, {
      tuning: selectedTuning.notes,
      maxFret: 15,
      maxSpan: 4,
      maxResults: 40,
      requiredBass: resolvedBass,
      othersOut: others,
    });
    otherVoicings = others;

    if (voicings.length === 0) {
      errorMsg = t('finder.noVoicingsForTuning', displayAccidental(symbol), tTuning(selectedTuning.name));
    } else {
      // Auto-select the lowest fret position
      const groups = new Set(voicings.map(v => v.positionGroup));
      const sorted = [...groups].sort((a, b) => {
        const fa = a === 'Open position' ? -1 : parseInt(a.replace('Fret ', ''));
        const fb = b === 'Open position' ? -1 : parseInt(b.replace('Fret ', ''));
        return fa - fb;
      });
      if (sorted.length > 0) selectedFretFilter = sorted[0];
    }
  }

  function goBack() {
    phase = 'browse';
    activeChordSymbol = '';
    voicings = [];
    otherVoicings = [];
    errorMsg = '';
  }

  // When navigated to from ChordIdentifier, auto-select the chord
  // Also restore voicings from persisted state on mount
  $effect(() => {
    const chord = initialChord;
    const frets = initialFrets;
    if (chord) {
      untrack(() => {
        activeChordSymbol = chord;
        loadVoicings(chord);
        phase = 'voicings';

        // If frets were provided (e.g. from Chord Identifier), find and select the matching voicing
        if (frets) {
          const fretKey = frets.join(',');
          let matchIdx = voicings.findIndex(v => v.frets.join(',') === fretKey);
          if (matchIdx === -1) {
            const otherIdx = otherVoicings.findIndex(v => v.frets.join(',') === fretKey);
            if (otherIdx !== -1) {
              matchIdx = voicings.length + otherIdx;
            } else {
              // Voicing not in either list (filtered out by DFS cap or redundant-mute elimination).
              // Inject it into otherVoicings so the user always sees what they clicked.
              const injected = fretsToVoicing(frets, selectedTuning.notes);
              const rootPC = chordNotes[0];
              injected.caged = rootPC ? classifyCAGED(injected, rootPC, selectedTuning.notes) : undefined;
              const fretted = frets.filter(f => f > 0);
              const hasOpen = frets.some(f => f === 0);
              injected.positionGroup = (fretted.length === 0 || hasOpen) ? 'Open position' : `Fret ${Math.min(...fretted)}`;
              injected.rank = otherVoicings.length + 1;
              otherVoicings = [...otherVoicings, injected];
              matchIdx = voicings.length + otherVoicings.length - 1;
            }
            // Expand the "Other possibilities" group
            const next = new Set(collapsedGroups);
            next.delete('__others__');
            collapsedGroups = next;
          }
          if (matchIdx !== -1) {
            const matched = matchIdx < voicings.length ? voicings[matchIdx] : otherVoicings[matchIdx - voicings.length];
            selectedFretFilter = matched.positionGroup;
            selectedIdx = matchIdx;
            // Scroll to the selected voicing after DOM updates
            tick().then(() => {
              const el = document.querySelector('.voicing-item.active');
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
          }
        }
      });
    } else if (phase === 'voicings' && activeChordSymbol && voicings.length === 0 && !errorMsg) {
      untrack(() => {
        const savedFretFilter = cfs.selectedFretFilter;
        const savedIdx = cfs.selectedIdx;
        loadVoicings(activeChordSymbol);
        selectedFretFilter = savedFretFilter;
        if (savedIdx !== null && savedIdx >= 0 && savedIdx < voicings.length) {
          selectedIdx = savedIdx;
        }
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
    return tPosition(v.positionGroup);
  }

  function cagedLabel(v: Voicing): string {
    if (!v.caged) return t('finder.otherShape');
    return tShapeLabel(v.caged.label);
  }

  function filterNoteLabel(fp: { string: number; fret: number }): string {
    const note = Note.pitchClass(Note.transpose(selectedTuning.notes[fp.string], Interval.fromSemitones(fp.fret)));
    return fp.fret === 0 ? t('finder.noteOpen', displayAccidental(note)) : t('finder.noteFret', displayAccidental(note), fp.fret);
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
        // Don't override when an "other" voicing is selected (e.g. navigated from Identifier)
        if (selectedIdx !== null && selectedIdx >= voicings.length) return;
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
    filterCategories = [];
    filterScaleRoot = '';
    filterScaleMode = '';
    filterSlashBass = '';
  }

  function clearScaleFilter() {
    filterScaleRoot = '';
    filterScaleMode = '';
  }

  function clearNonScaleFilters() {
    searchText = '';
    filterRoots = [];
    filterCategories = [];
  }

  function handleScaleRootClick(r: string) {
    const newRoot = filterScaleRoot === r ? '' : r;
    filterScaleRoot = newRoot;
    if (newRoot) {
      if (!filterScaleMode) filterScaleMode = 'ionian';
      clearNonScaleFilters();
    }
  }

  function handleScaleModeClick(mode: string) {
    if (filterScaleRoot && filterScaleMode === mode) return;
    filterScaleMode = filterScaleMode === mode ? '' : mode;
    if (filterScaleMode) {
      if (!filterScaleRoot) filterScaleRoot = 'C';
      clearNonScaleFilters();
    }
  }

  function handleNonScaleFilterAction() {
    clearScaleFilter();
  }

  const hasAnyBrowseFilter = $derived(
    searchText !== '' || filterRoots.length > 0 || filterCategories.length > 0 || filterScaleRoot !== '' || filterScaleMode !== '' || filterSlashBass !== ''
  );

  function toggleFilter(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
  }


</script>

<div class="page-root">
  {#if phase === 'browse'}
    <!-- ============ CHORD BROWSER PHASE ============ -->
    <div class="browse-scroll-area">
      <div class="browse-header no-print">
        <div class="browse-filters">
        <div class="filter-row">
          <label class="filter-label">{t('finder.search')}</label>
          <div class="filter-options">
            <input
              id="chord-search"
              type="text"
              bind:value={searchText}
              onkeydown={handleBrowseKeydown}
              oninput={handleNonScaleFilterAction}
              placeholder={t('finder.typeChordName')}
              class="search-input"
            />
          </div>
        </div>

        <div class="filter-row">
          <label class="filter-label">{t('common.root')}</label>
          <div class="filter-options">
            {#each FILTER_ROOTS as r}
              <button
                class="filter-btn"
                class:active={filterRoots.includes(r)}
                onclick={() => { handleNonScaleFilterAction(); filterRoots = toggleFilter(filterRoots, r); }}
              >{displayAccidental(r)}</button>
            {/each}
            {#if filterRoots.length > 0}
              <button class="filter-row-clear" onclick={() => filterRoots = []}>&times;</button>
            {/if}
          </div>
        </div>

        <div class="filter-row">
          <label class="filter-label">{t('common.type')}</label>
          <div class="filter-options">
            {#each ALL_CATEGORIES as cat}
              <button
                class="filter-btn"
                class:active={filterCategories.includes(cat)}
                onclick={() => { handleNonScaleFilterAction(); filterCategories = toggleFilter(filterCategories, cat); }}
              >{tCategory(cat)}</button>
            {/each}
            {#if filterCategories.length > 0}
              <button class="filter-row-clear" onclick={() => filterCategories = []}>&times;</button>
            {/if}
          </div>
        </div>

        <div class="filter-divider"></div>

        <div class="filter-row">
          <label class="filter-label">{t('finder.scale')}</label>
          <div class="filter-options">
            <div class="filter-options-sub">
              <span class="filter-sublabel">{t('finder.scaleRoot')}</span>
              {#each FILTER_ROOTS as r}
                <button
                  class="filter-btn"
                  class:active={filterScaleRoot === r}
                  onclick={() => handleScaleRootClick(r)}
                >{displayAccidental(r)}</button>
              {/each}
            </div>
            <div class="filter-options-sub">
              <span class="filter-sublabel">{t('finder.mode')}</span>
              {#each SCALE_MODES as mode}
                <button
                  class="filter-btn"
                  class:active={filterScaleMode === mode}
                  onclick={() => handleScaleModeClick(mode)}
                >{tMode(mode)}</button>
              {/each}
            </div>
            {#if filterScale}
              <div class="filter-options-sub">
                <label class="extensions-toggle">
                  <span class="toggle-label">{t('finder.includeExtensions')}</span>
                  <span class="toggle-switch" class:on={includeExtensions} onclick={() => includeExtensions = !includeExtensions} role="switch" aria-checked={includeExtensions} tabindex="0" onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); includeExtensions = !includeExtensions; } }}>
                    <span class="toggle-knob"></span>
                  </span>
                </label>
              </div>
            {/if}
          </div>
        </div>

        <div class="filter-divider"></div>

        <div class="filter-row">
          <label class="filter-label">{t('finder.slash')}</label>
          <div class="filter-options">
            {#each FILTER_ROOTS as r}
              <button
                class="filter-btn"
                class:active={filterSlashBass === r}
                onclick={() => filterSlashBass = filterSlashBass === r ? '' : r}
              >{displayAccidental(r)}</button>
            {/each}
            {#if filterSlashBass}
              <button class="filter-row-clear" onclick={() => filterSlashBass = ''}>&times;</button>
            {/if}
          </div>
        </div>

        <button class="btn btn-secondary btn-clear-all" class:invisible={!hasAnyBrowseFilter} onclick={clearBrowseFilters}>{t('finder.clearAll')}</button>
      </div>
    </div>

    <div class="chord-count">{tc('count.chord', filteredChordList.length)}</div>

    {#if filterScale && scaleDegreeGroups.length > 0}
      <div class="degree-grouped-grid">
        {#each scaleDegreeGroups as group}
          <div class="degree-section">
            <div class="degree-label">{group.romanLabel}<span class="degree-function"> — {tFunctionName(group.functionName)}</span></div>
            <div class="chord-grid">
              {#each group.chords as entry}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="chord-card" onclick={() => selectChord(entry.symbol)}>
                  <span class="chord-card-name">{displayAccidental(entry.symbol)}</span>
                  <span class="chord-card-type">{tTypeName(entry.typeName)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="chord-grid">
        {#each filteredChordList as entry}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="chord-card" onclick={() => selectChord(entry.symbol)}>
            <span class="chord-card-name">{displayAccidental(entry.symbol)}</span>
            <span class="chord-card-type">{tTypeName(entry.typeName)}</span>
            {#if entry.keys.length > 0}
              <span class="chord-card-keys">{entry.keys.slice(0, 3).map(k => displayAccidental(k)).join(', ')}{entry.keys.length > 3 ? ', ...' : ''}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if filteredChordList.length === 0}
      <p class="no-match-msg">{t('finder.noMatch')}</p>
    {/if}
    </div>

  {:else}
    <!-- ============ VOICINGS PHASE ============ -->
    <div class="controls no-print">
      <button class="btn btn-secondary btn-back" onclick={goBack}>{t('finder.backToChords')}</button>

      <div class="control-group quick-search-group">
        <label for="quick-chord-search">{t('finder.switchChord')}</label>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="quick-search-wrapper" onkeydown={handleQuickSearchKeydown}>
          <input
            id="quick-chord-search"
            type="text"
            bind:value={quickSearchText}
            onfocus={() => { quickSearchFocused = true; }}
            onblur={() => { setTimeout(() => { quickSearchFocused = false; }, 150); }}
            placeholder={t('finder.typeChord')}
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
                  <span class="quick-search-type">{tTypeName(entry.typeName)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="control-group">
        <label for="tuning-chord2">{t('common.tuning')}</label>
        <select id="tuning-chord2" value={selectedTuning.name} onchange={handleTuningChange}>
          {#each ALL_TUNINGS as tn}
            <option value={tn.name}>{tTuning(tn.name)}</option>
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
            <span class="chord-notes">({#if showIntervals && chordRoot}{chordNotes.map(n => getIntervalLabel(chordRoot, n)).join(' · ')}{:else}{chordNotes.map(n => displayAccidental(n)).join(' · ')}{/if})</span>
          {/if}
          <span class="chord-info-type">{tTypeName(activeChordEntry.typeName)}</span>
          <span class="chord-info-category">{tCategory(activeChordEntry.category)}</span>
          {#if activeChordEntry.keys.length > 0}
            <span class="chord-info-keys">{t('common.keys')}: {activeChordEntry.keys.map(k => displayAccidental(k)).join(', ')}</span>
          {/if}
          <label class="intervals-toggle">
            <span class="toggle-label">{t('common.intervals')}</span>
            <span class="toggle-switch" class:on={showIntervals} onclick={() => showIntervals = !showIntervals} role="switch" aria-checked={showIntervals} tabindex="0" onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showIntervals = !showIntervals; } }}>
              <span class="toggle-knob"></span>
            </span>
          </label>
        </div>

        {#if relatedChords.length > 0}
          <div class="related-chords-bar">
            <span class="related-label">{t('finder.related')}</span>
            {#each relatedInline as rc}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="related-chip" onclick={() => selectChord(rc.symbol)}>
                <span class="related-chip-name">{displayAccidental(rc.symbol)}</span>
                <span class="related-chip-relation">{tRelation(rc.relation)}</span>
              </span>
            {/each}
            {#if relatedOverflow.length > 0}
              <span class="related-more-wrapper">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="related-chip related-more-btn" onclick={() => relatedMoreOpen = !relatedMoreOpen}>
                  &hellip;
                </span>
                {#if relatedMoreOpen}
                  <div class="related-more-dropdown">
                    {#each relatedOverflow as rc}
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div class="related-more-item" onclick={() => { relatedMoreOpen = false; selectChord(rc.symbol); }}>
                        <span class="related-chip-name">{displayAccidental(rc.symbol)}</span>
                        <span class="related-chip-relation">{tRelation(rc.relation)}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </span>
            {/if}
          </div>
        {/if}
      {/if}

      <div class="voicings-scroll-area" class:tablet={isTablet}>
      {#snippet fretSelectorBtnContent(item: FretSelectorItem)}
        <span class="fret-selector-label">{item.positionGroup === 'Open position' ? t('common.open') : t('common.fretN', item.fretNumber)}</span>
        <MiniChordDiagram voicing={item.bestVoicing} tuning={selectedTuning} />
        <span class="fret-selector-tags">
          {#each item.labels.slice(0, 2) as lbl}
            <span class="fret-selector-tag">{tShapeLabel(lbl)}</span>
          {/each}
          {#if item.labels.length > 2}
            <span class="fret-selector-tag">+{item.labels.length - 2}</span>
          {/if}
        </span>
        <span class="fret-selector-count">{tc('count.chord', item.count)}</span>
      {/snippet}

      {#snippet mobileFretSelectorBtnContent(item: FretSelectorItem)}
        <MiniChordDiagram voicing={item.bestVoicing} tuning={selectedTuning} />
        <span class="mobile-selector-text">
          <span class="fret-selector-label">{item.positionGroup === 'Open position' ? t('common.open') : t('common.fretN', item.fretNumber)}</span>
          <span class="fret-selector-tags">
            {#each item.labels.slice(0, 2) as lbl}
              <span class="fret-selector-tag">{tShapeLabel(lbl)}</span>
            {/each}
            {#if item.labels.length > 2}
              <span class="fret-selector-tag">+{item.labels.length - 2}</span>
            {/if}
          </span>
          <span class="fret-selector-count">{tc('count.chord', item.count)}</span>
        </span>
      {/snippet}

      <!-- Fretboard section: hidden on phone detail view (tablet shows both) -->
      {#if !(needsVertical && !isTablet && mobileView === 'detail')}
        {#if needsVertical}
          <!-- Mobile: vertical fretboard + side selectors (single scroll container) -->
          <div class="mobile-fretboard-layout">
            <Fretboard
              tuning={selectedTuning}
              fretCount={15}
              mode={showIntervals && chordRoot ? 'intervals' : 'notes'}
              rootNote={chordRoot ?? 'C'}
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
                    onclick={() => { selectedFretFilter = item.positionGroup; if (!isTablet) mobileView = 'detail'; }}
                  >
                    {@render mobileFretSelectorBtnContent(item)}
                  </button>
                </div>
              {/each}
              <div class="mobile-selector-slot" style="top: {FB_SVG_WIDTH - 50}px;">
                <button
                  class="fret-selector-btn fret-selector-all"
                  class:active={selectedFretFilter === 'all'}
                  onclick={() => { selectedFretFilter = 'all'; if (!isTablet) mobileView = 'detail'; }}
                >
                  <span class="mobile-selector-text">
                    <span class="fret-selector-label">{t('finder.all')}</span>
                    <span class="fret-selector-all-desc">{t('finder.sortedByPlayability')}</span>
                    <span class="fret-selector-count">{tc('count.chord', voicings.length)}</span>
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
                mode={showIntervals && chordRoot ? 'intervals' : 'notes'}
                rootNote={chordRoot ?? 'C'}
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
                      onclick={() => { if (selectedFretFilter !== item.positionGroup) selectedFretFilter = item.positionGroup; }}
                    >
                      {@render fretSelectorBtnContent(item)}
                    </button>
                  </div>
                {/each}
                <div class="fret-selector-slot fret-selector-all-slot" style="left: {FB_SVG_WIDTH - 50}px;">
                  <button
                    class="fret-selector-btn fret-selector-all"
                    class:active={selectedFretFilter === 'all'}
                    onclick={() => { if (selectedFretFilter !== 'all') selectedFretFilter = 'all'; }}
                  >
                    <span class="fret-selector-label">{t('finder.all')}</span>
                    <span class="fret-selector-all-desc">{t('finder.sortedByPlayability')}</span>
                    <span class="fret-selector-count">{tc('count.chord', voicings.length)}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {#if selectedFretFilter}
            <p class="fretboard-hint no-print">{t('finder.clickToFilter')}</p>
          {/if}

          {#if filterPositions.length > 0}
            <div class="filter-info no-print">
              {#each filterPositions as fp, i}
                <span class="filter-tag">
                  {filterNoteLabel(fp)}
                  <button class="filter-tag-x" onclick={() => { filterPositions = filterPositions.filter((_, j) => j !== i); }}>&times;</button>
                </span>
              {/each}
              <button class="btn-clear-filter" onclick={clearFretboardFilters}>{t('finder.clearAllFilter')}</button>
            </div>
          {/if}
        {/if}
      {/if}

      <!-- Detail section: on phone only in detail view; on tablet/desktop when fret selected -->
      {#if needsVertical && !isTablet && mobileView === 'detail'}
        <button class="mobile-back-btn" onclick={() => mobileView = 'fretboard'}>{t('finder.backToFretboard')}</button>
      {/if}

      {#if !(needsVertical && !isTablet && mobileView === 'fretboard') && selectedFretFilter}
      <div class="finder-split">
        <div class="voicing-list">
          <!-- Shape filter -->
          {#if availableCaged.length > 0}
            <div class="voicing-toolbar no-print">
              <ButtonFilter
                label={t('common.shape')}
                options={availableCaged.map(l => ({ value: l, label: l === 'Other' ? t('finder.otherShape') : tShapeLabel(l) }))}
                selected={filterCaged}
                onchange={(v) => filterCaged = v}
              />
            </div>
          {/if}

          <div class="section-title">
            <div class="section-title-row">
              <span>
                {tc('count.voicingFiltered', filteredVoicings.length)}
              </span>
            </div>
          </div>

          {#if filteredVoicings.length === 0 && (filterPositions.length > 0 || selectedFretFilter || filterCaged.length > 0)}
            <div class="no-match-msg">{t('finder.noVoicingsMatch')}</div>
          {/if}
          <div class="voicing-items">
            {#each displayGroups as group}
              {#if group.label}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="position-group-header" onclick={() => toggleGroup(group.label)}>
                  <span class="group-chevron" class:collapsed={collapsedGroups.has(group.label)}>&#9662;</span>
                  {tPosition(group.label)} <span class="group-count">({group.items.length})</span>
                </div>
              {/if}
              {#if !group.label || !collapsedGroups.has(group.label)}
              {#each group.items as { voicing: v, origIdx }}
                {@const pk = pool.keyFor(v.frets, activeChordSymbol)}
                {@const inPool = pool.entries.some(e => e.key === pk)}
                {@const usedInProg = progression.hasPoolKey(pk)}
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
                        <span class="tag tag-caged tag-clickable" onclick={(e) => { e.stopPropagation(); onNavigateToShape?.(v.caged!.shape, v.caged!.position); }}>{tShapeLabel(v.caged.label)}</span>
                      {:else}
                        <span class="tag tag-caged">{tShapeLabel(v.caged.label)}</span>
                      {/if}
                    {:else}
                      <span class="tag tag-other">{t('finder.otherShape')}</span>
                    {/if}
                    {#if selectedFretFilter === 'all'}
                      <span class="tag tag-pos">{positionLabel(v)}</span>
                    {/if}
                    {#if v.barres.length > 0}
                      <span class="tag tag-barre">{t('finder.barreFretN', v.barres[0].fret)}</span>
                    {/if}
                  </span>
                  <span class="voicing-score" title={t('finder.playabilityRanking')}>{t('finder.rankedOf', v.rank, voicings.length)}</span>
                  <span class="voicing-actions">
                    <button
                      class="voicing-action-btn"
                      class:in-pool={inPool}
                      class:disabled={inPool && usedInProg}
                      title={inPool ? (usedInProg ? t('finder.usedInProgression') : t('finder.removeFromPool')) : t('finder.addToPool')}
                      disabled={inPool && usedInProg}
                      onclick={(e) => { e.stopPropagation(); if (inPool) { if (!usedInProg) { pool.remove(pk); toast.show(t('finder.removedFromPool')); } } else { pool.add(v, selectedTuning, activeChordSymbol); toast.show(t('finder.addedToPool')); } }}
                    >{inPool ? t('finder.deleteFromPool') : t('finder.addToPoolBtn')}</button>
                    <button
                      class="voicing-action-btn"
                      title={t('finder.addToProgression')}
                      onclick={(e) => { e.stopPropagation(); if (!inPool) pool.add(v, selectedTuning, activeChordSymbol); const pending = progression.pendingCellIdx; if (pending !== null && pending >= 0 && pending < progression.cells.length) { progression.cells[pending] = { ...progression.cells[pending], poolKey: pk }; progression.persist(); progression.pendingCellIdx = null; toast.show(t('finder.placedIntoCell')); setTimeout(() => { progression.pendingNav = 'progression'; }, 1000); } else { progression.pushFromPool(pk); toast.show(t('finder.addedToProgression')); } }}
                    >{t('finder.addToProgressionBtn')}</button>
                  </span>
                </div>
              {/each}
              {/if}
            {/each}
            {#if filteredOtherVoicings.length > 0}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="position-group-header other-possibilities-header" onclick={() => toggleGroup('__others__')}>
                <span class="group-chevron" class:collapsed={collapsedGroups.has('__others__')}>&#9662;</span>
                {t('finder.otherPossibilities')} <span class="group-count">({filteredOtherVoicings.length})</span>
              </div>
              {#if !collapsedGroups.has('__others__')}
              {#each filteredOtherVoicings as v}
                {@const otherOrigIdx = otherVoicings.indexOf(v)}
                {@const pk = pool.keyFor(v.frets, activeChordSymbol)}
                {@const inPool = pool.entries.some(e => e.key === pk)}
                {@const usedInProg = progression.hasPoolKey(pk)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="voicing-item"
                  class:active={selectedIdx === voicings.length + otherOrigIdx}
                  onclick={() => selectVoicing(voicings.length + otherOrigIdx)}
                >
                  <span class="voicing-frets">{fretLabel(v)}</span>
                  <span class="voicing-tags">
                    {#if v.caged}
                      {#if onNavigateToShape}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span class="tag tag-caged tag-clickable" onclick={(e) => { e.stopPropagation(); onNavigateToShape?.(v.caged!.shape, v.caged!.position); }}>{tShapeLabel(v.caged.label)}</span>
                      {:else}
                        <span class="tag tag-caged">{tShapeLabel(v.caged.label)}</span>
                      {/if}
                    {:else}
                      <span class="tag tag-other">{t('finder.otherShape')}</span>
                    {/if}
                    {#if selectedFretFilter === 'all'}
                      <span class="tag tag-pos">{positionLabel(v)}</span>
                    {/if}
                    {#if v.barres.length > 0}
                      <span class="tag tag-barre">{t('finder.barreFretN', v.barres[0].fret)}</span>
                    {/if}
                  </span>
                  <span class="voicing-score" title={t('finder.playabilityRanking')}>{t('finder.rankedOf', v.rank, otherVoicings.length)}</span>
                  <span class="voicing-actions">
                    <button
                      class="voicing-action-btn"
                      class:in-pool={inPool}
                      class:disabled={inPool && usedInProg}
                      title={inPool ? (usedInProg ? t('finder.usedInProgression') : t('finder.removeFromPool')) : t('finder.addToPool')}
                      disabled={inPool && usedInProg}
                      onclick={(e) => { e.stopPropagation(); if (inPool) { if (!usedInProg) { pool.remove(pk); toast.show(t('finder.removedFromPool')); } } else { pool.add(v, selectedTuning, activeChordSymbol); toast.show(t('finder.addedToPool')); } }}
                    >{inPool ? t('finder.deleteFromPool') : t('finder.addToPoolBtn')}</button>
                    <button
                      class="voicing-action-btn"
                      title={t('finder.addToProgression')}
                      onclick={(e) => { e.stopPropagation(); if (!inPool) pool.add(v, selectedTuning, activeChordSymbol); const pending = progression.pendingCellIdx; if (pending !== null && pending >= 0 && pending < progression.cells.length) { progression.cells[pending] = { ...progression.cells[pending], poolKey: pk }; progression.persist(); progression.pendingCellIdx = null; toast.show(t('finder.placedIntoCell')); setTimeout(() => { progression.pendingNav = 'progression'; }, 1000); } else { progression.pushFromPool(pk); toast.show(t('finder.addedToProgression')); } }}
                    >{t('finder.addToProgressionBtn')}</button>
                  </span>
                </div>
              {/each}
              {/if}
            {/if}
          </div>
        </div>

        <div class="voicing-detail">
          {#if selectedVoicing}
            <div class="section-title">
              {fretLabel(selectedVoicing)}
              <span class="detail-score" title={t('finder.playabilityRanking')}>{t('finder.rankedOf', selectedVoicing.rank, selectedIsOther ? otherVoicings.length : voicings.length)}</span>
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
                <span class="tag tag-other">{t('finder.otherShape')}</span>
              {/if}
              {#if selectedVoicing.barres.length > 0}
                <span class="tag tag-barre">{t('finder.barreFretN', selectedVoicing.barres[0].fret)}</span>
              {/if}
            </div>
            <ChordDiagram voicing={selectedVoicing} tuning={selectedTuning} chordName={activeChordSymbol} initialShowIntervals={showIntervals} />
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

  .fretboard-container {
    padding-right: 24px;
  }

  .voicings-scroll-area {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    margin-right: calc(-1 * var(--scroll-extend));
    padding-right: var(--scroll-extend);
  }

  .voicings-scroll-area.tablet {
    display: flex;
    flex-direction: row;
    gap: 24px;
    overflow: hidden;
  }

  .voicings-scroll-area.tablet .mobile-fretboard-layout {
    flex: 0 0 auto;
    margin-top: 0;
  }

  .voicings-scroll-area.tablet .finder-split {
    flex: 1;
    min-width: 0;
    flex-direction: column;
    overflow-y: auto;
    margin-top: 0;
    padding-right: 24px;
  }

  .voicings-scroll-area.tablet .voicing-detail {
    order: -1;
    position: static;
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
  .browse-scroll-area {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding-right: calc(var(--scroll-extend) + 24px);
    margin-right: calc(-1 * var(--scroll-extend));
  }

  .browse-header {
    margin-bottom: 12px;
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

  .filter-divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 0;
  }

  .degree-grouped-grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .degree-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .degree-label {
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.5px;
    padding-bottom: 2px;
    border-bottom: 1px solid var(--border);
  }

  .degree-function {
    font-weight: 400;
    font-size: 13px;
    color: var(--text-muted);
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
    flex: 0 1 260px;
    min-width: 180px;
  }
  .quick-search-group label {
    white-space: nowrap;
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
  }

  .chord-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
    padding: 2px;
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

  .other-possibilities-header {
    margin-top: 8px;
    border-top: 2px solid var(--border);
    color: var(--text-muted);
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
    height: 175px;
    margin-top: 4px;
    overflow: visible;
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
    overflow: hidden;
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
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--tag-caged-bg);
    color: var(--tag-caged);
    white-space: nowrap;
  }

  .fret-selector-count {
    font-size: 10px;
    color: var(--text-muted);
  }

  .fret-selector-all-slot .fret-connector {
    visibility: hidden;
  }

  .fret-selector-all {
    justify-content: center;
  }

  .fret-selector-all-desc {
    font-size: 10px;
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
    flex: 1;
    min-width: 0;
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
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    white-space: nowrap;
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

  .voicing-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .voicing-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px 8px;
    min-width: 105px;
    border: 1.5px solid var(--border);
    border-radius: 4px;
    background: var(--bg-card);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .voicing-action-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .voicing-action-btn.in-pool {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }

  .voicing-action-btn.in-pool:hover {
    opacity: 0.85;
  }

  .voicing-action-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
  .intervals-toggle {
    margin-left: auto;
    align-self: center;
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
    }
    .browse-scroll-area {
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
    padding-right: 12px;
  }

  .mobile-selector-col {
    position: relative;
    flex-shrink: 0;
    width: 130px;
  }

  .mobile-selector-slot {
    position: absolute;
    left: 0;
    right: 0;
    transform: translateY(-50%);
  }

  .mobile-selector-col .fret-selector-btn {
    flex-direction: row;
    width: 100%;
    height: 62px;
    padding: 3px 4px;
    gap: 3px;
    align-items: center;
    overflow: hidden;
  }

  .mobile-selector-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    min-width: 0;
  }

  .mobile-selector-col .fret-selector-label {
    font-size: 9px;
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
    font-size: 9px;
  }

  .mobile-selector-col .fret-selector-all {
    flex-direction: row;
    height: 62px;
    align-items: center;
  }

  .mobile-selector-col .fret-selector-all-desc {
    font-size: 9px;
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

  /* Extensions toggle in scale filter */
  .extensions-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }

  /* Related chords bar */
  .related-chords-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    flex-wrap: wrap;
  }

  .related-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
    white-space: nowrap;
  }

  .related-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .related-chip:hover {
    background: var(--bg-secondary);
    border-color: var(--accent);
  }

  .related-chip-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .related-chip-relation {
    font-size: 10px;
    color: var(--text-muted);
  }

  .related-more-wrapper {
    position: relative;
  }

  .related-more-btn {
    padding: 3px 10px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  .related-more-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px 0;
    z-index: 20;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .related-more-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .related-more-item:hover {
    background: var(--bg-secondary);
  }
</style>
