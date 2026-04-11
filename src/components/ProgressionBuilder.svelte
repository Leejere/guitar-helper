<script lang="ts">
  import { pool, type PoolEntry } from '../lib/pool.svelte';
  import { progression } from '../lib/progression.svelte';
  import { responsive } from '../lib/responsive.svelte';
  import { displayAccidental, getChord, normalizeInput } from '../lib/music';
  import { filterChords, type ChordEntry } from '../lib/chords';
  import { findVoicings } from '../lib/voicings';
  import { STANDARD } from '../lib/tunings';
  import { jsPDF } from 'jspdf';
  import html2canvas from 'html2canvas';
  import MiniChordDiagram from './MiniChordDiagram.svelte';
  import ChordDiagram from './ChordDiagram.svelte';

  interface Props {
    onNavigateToFinder?: () => void;
    onNavigateToChord?: (chordName: string) => void;
    onNavigateToIdentifier?: () => void;
    onNavigateToShapes?: () => void;
  }

  let { onNavigateToFinder, onNavigateToChord, onNavigateToIdentifier, onNavigateToShapes }: Props = $props();

  // Quick-add search state
  let quickSearch = $state('');
  let quickResults: ChordEntry[] = $state([]);
  let quickDropdownOpen = $state(false);
  let quickAddingSymbol: string | null = $state(null);

  function updateQuickResults(value: string) {
    quickSearch = value;
    if (value.trim().length === 0) {
      quickResults = [];
      quickDropdownOpen = false;
      return;
    }
    quickResults = filterChords({
      search: value,
      roots: [],
      keys: [],
      categories: [],
      voicings: ['root'],
      scale: '',
    }).slice(0, 8);
    quickDropdownOpen = quickResults.length > 0;
  }

  function handleQuickAdd(entry: ChordEntry) {
    quickAddingSymbol = entry.symbol;
    try {
      const chord = getChord(normalizeInput(entry.symbol));
      if (!chord || chord.empty || !chord.notes?.length) return;
      const voicings = findVoicings(chord.notes, {
        tuning: STANDARD.notes,
        maxFret: 15,
        maxSpan: 4,
        maxResults: 1,
        requiredBass: entry.bassNote,
      });
      if (voicings.length > 0) {
        pool.add(voicings[0], STANDARD, entry.symbol);
      }
    } finally {
      quickAddingSymbol = null;
      quickSearch = '';
      quickResults = [];
      quickDropdownOpen = false;
    }
  }

  function handleQuickNavigate(entry: ChordEntry) {
    quickSearch = '';
    quickResults = [];
    quickDropdownOpen = false;
    onNavigateToChord?.(entry.symbol);
  }

  function handleQuickBlur() {
    setTimeout(() => { quickDropdownOpen = false; }, 200);
  }

  function handleQuickKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      quickSearch = '';
      quickResults = [];
      quickDropdownOpen = false;
      (e.target as HTMLInputElement)?.blur();
    }
  }

  // Cell-level quick-add state
  let cellQuickIdx: number | null = $state(null);
  let cellQuickSearch = $state('');
  let cellQuickResults: ChordEntry[] = $state([]);
  let cellQuickOpen = $state(false);
  let cellQuickAdding: string | null = $state(null);

  function positionDropdown(node: HTMLElement) {
    function reposition() {
      const vw = window.innerWidth;
      const pad = 8;
      if (vw < 480) {
        // Narrow screen: fixed full-width
        const rect = node.parentElement!.getBoundingClientRect();
        node.style.position = 'fixed';
        node.style.left = pad + 'px';
        node.style.right = pad + 'px';
        node.style.top = (rect.bottom + 2) + 'px';
        node.style.width = 'auto';
        node.style.minWidth = 'unset';
      } else {
        // Wider screen: absolute, but clamp to viewport
        node.style.position = 'absolute';
        node.style.top = '100%';
        node.style.right = '';
        node.style.width = '';
        const rect = node.getBoundingClientRect();
        if (rect.right > vw - pad) {
          const overflow = rect.right - (vw - pad);
          node.style.left = (-overflow) + 'px';
        } else {
          node.style.left = '0';
        }
      }
    }
    reposition();
    return { destroy() {} };
  }

  function showCellQuick(idx: number) {
    if (selectMode) return;
    cellQuickIdx = idx;
  }

  function hideCellQuick(idx: number) {
    if (cellQuickIdx !== idx) return;
    cellQuickIdx = null;
    cellQuickSearch = '';
    cellQuickResults = [];
    cellQuickOpen = false;
    cellQuickAdding = null;
  }

  function updateCellQuickResults(value: string) {
    cellQuickSearch = value;
    if (value.trim().length === 0) {
      cellQuickResults = [];
      cellQuickOpen = false;
      return;
    }
    cellQuickResults = filterChords({
      search: value,
      roots: [],
      keys: [],
      categories: [],
      voicings: ['root'],
      scale: '',
    }).slice(0, 6);
    cellQuickOpen = cellQuickResults.length > 0;
  }

  function handleCellQuickAdd(entry: ChordEntry, idx: number) {
    cellQuickAdding = entry.symbol;
    try {
      const chord = getChord(normalizeInput(entry.symbol));
      if (!chord || chord.empty || !chord.notes?.length) return;
      const voicings = findVoicings(chord.notes, {
        tuning: STANDARD.notes,
        maxFret: 15,
        maxSpan: 4,
        maxResults: 1,
        requiredBass: entry.bassNote,
      });
      if (voicings.length > 0) {
        pool.add(voicings[0], STANDARD, entry.symbol);
        const key = pool.keyFor(voicings[0].frets, entry.symbol);
        progression.pushToCell(key, idx);
      }
    } finally {
      cellQuickAdding = null;
      cellQuickSearch = '';
      cellQuickResults = [];
      cellQuickOpen = false;
      cellQuickIdx = null;
    }
  }

  function handleCellQuickKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cellQuickSearch = '';
      cellQuickResults = [];
      cellQuickOpen = false;
      cellQuickIdx = null;
      (e.target as HTMLInputElement)?.blur();
    }
  }

  // PDF export
  let progressionGridEl: HTMLDivElement | undefined = $state(undefined);
  let exporting = $state(false);

  async function handleExportPdf() {
    if (!progressionGridEl || exporting) return;
    exporting = true;
    try {
      // Add export class for white background and hidden buttons
      progressionGridEl.classList.add('exporting');
      // Wait a frame for styles to apply
      await new Promise(r => requestAnimationFrame(r));

      const canvas = await html2canvas(progressionGridEl, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      progressionGridEl.classList.remove('exporting');

      const imgData = canvas.toDataURL('image/png');
      const imgW = canvas.width;
      const imgH = canvas.height;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const m = 32;

      // Title on first page
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 40, 30);
      doc.text(progression.title, pw / 2, m, { align: 'center' });

      // Scale image to page width
      const contentW = pw - m * 2;
      const scale = contentW / imgW;
      const totalH = imgH * scale;
      const headerH = m + 24; // title space
      const footerH = 20;
      const pageContentH = ph - headerH - footerH;

      let srcY = 0; // tracks position in the source image (in scaled coords)
      let page = 0;

      while (srcY < totalH) {
        if (page > 0) doc.addPage();
        const yStart = page === 0 ? headerH : m;
        const availH = page === 0 ? pageContentH : ph - m - footerH;
        const drawH = Math.min(availH, totalH - srcY);

        // Clip source region from canvas
        const srcPixelY = srcY / scale;
        const srcPixelH = drawH / scale;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = imgW;
        sliceCanvas.height = Math.ceil(srcPixelH);
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, srcPixelY, imgW, srcPixelH, 0, 0, imgW, srcPixelH);
        const sliceData = sliceCanvas.toDataURL('image/png');

        doc.addImage(sliceData, 'PNG', m, yStart, contentW, drawH);

        // Footer
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180);
        doc.text('Guitar Helper', pw / 2, ph - 10, { align: 'center' });

        srcY += drawH;
        page++;
      }

      const filename = progression.title.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'progression';
      doc.save(`${filename}.pdf`);
    } finally {
      progressionGridEl.classList.remove('exporting');
      exporting = false;
    }
  }

  // URL generation
  let urlCopied = $state(false);

  function handleGenerateUrl() {
    const snap = progression.toSnapshot();
    const json = JSON.stringify(snap);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    const url = `${window.location.origin}${window.location.pathname}#progression=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      urlCopied = true;
      setTimeout(() => { urlCopied = false; }, 2000);
    });
  }

  const isMobile = $derived(responsive.windowWidth < 768);

  // Pool column collapse state (mobile only)
  let poolCollapsed = $state(true);

  // Multi-select state
  let selectMode = $state(false);
  let selectedCells = $state(new Set<number>());
  let sweeping = $state(false);
  let swept = $state(false);

  // Click-to-move state
  let moveFromIdx: number | null = $state(null);

  // Drag state
  let dragSource: { type: 'pool' | 'progression'; key?: string; idx?: number } | null = $state(null);
  let dragOverIdx: number | null = $state(null);
  let dragOverZone: 'pool' | 'progression' | null = $state(null);

  function toggleSelectMode() {
    selectMode = !selectMode;
    selectedCells = new Set();
    sweeping = false;
    moveFromIdx = null;
  }

  function toggleCellSelection(idx: number) {
    const next = new Set(selectedCells);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    selectedCells = next;
  }

  function startSweep(idx: number) {
    if (!selectMode) return;
    sweeping = true;
    swept = false;
  }

  function sweepOver(idx: number) {
    if (!sweeping) return;
    swept = true;
    if (!selectedCells.has(idx)) {
      const next = new Set(selectedCells);
      next.add(idx);
      selectedCells = next;
    }
  }

  function endSweep() {
    sweeping = false;
  }

  function deleteSelected() {
    progression.deleteSelection([...selectedCells]);
    selectedCells = new Set();
    selectMode = false;
  }

  function duplicateSelected() {
    if (!selectionContiguous) return;
    progression.duplicateSelection([...selectedCells]);
    selectedCells = new Set();
    selectMode = false;
  }

  let selectionContiguous = $derived.by(() => {
    if (selectedCells.size <= 1) return true;
    const sorted = [...selectedCells].sort((a, b) => a - b);
    return sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
  });

  function handleCellClick(idx: number) {
    if (selectMode) {
      if (swept) return; // sweep already handled selection
      toggleCellSelection(idx);
      return;
    }

    const cell = progression.cells[idx];

    // Click-to-move logic
    if (moveFromIdx !== null) {
      if (moveFromIdx === idx) {
        // Cancel move
        moveFromIdx = null;
        return;
      }
      const fromCell = progression.cells[moveFromIdx];
      const toCell = progression.cells[idx];
      if (fromCell.poolKey && toCell.poolKey) {
        progression.swapCells(moveFromIdx, idx);
      } else if (fromCell.poolKey && !toCell.poolKey) {
        progression.moveToEmpty(moveFromIdx, idx);
      } else if (!fromCell.poolKey && toCell.poolKey) {
        progression.moveToEmpty(idx, moveFromIdx);
      }
      moveFromIdx = null;
      return;
    }

    // Start move mode for filled cells
    if (cell.poolKey) {
      moveFromIdx = idx;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      moveFromIdx = null;
      if (selectMode) {
        selectMode = false;
        selectedCells = new Set();
      }
    }
  }

  // Drag handlers for pool entries
  function handlePoolDragStart(e: DragEvent, entry: PoolEntry) {
    dragSource = { type: 'pool', key: entry.key };
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', entry.key);
  }

  // Drag handlers for progression cells
  function handleCellDragStart(e: DragEvent, idx: number) {
    const cell = progression.cells[idx];
    if (!cell.poolKey) { e.preventDefault(); return; }
    dragSource = { type: 'progression', idx, key: cell.poolKey };
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', cell.poolKey);
  }

  function handleCellDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    dragOverIdx = idx;
    dragOverZone = 'progression';
  }

  function handleCellDrop(e: DragEvent, idx: number) {
    e.preventDefault();
    if (!dragSource) return;

    if (dragSource.type === 'pool' && dragSource.key) {
      // Pool → Progression cell
      if (progression.cells[idx].poolKey === null) {
        progression.pushToCell(dragSource.key, idx);
      }
    } else if (dragSource.type === 'progression' && dragSource.idx !== undefined) {
      // Progression → Progression
      const fromIdx = dragSource.idx;
      if (fromIdx !== idx) {
        if (progression.cells[idx].poolKey === null) {
          progression.moveToEmpty(fromIdx, idx);
        } else {
          progression.swapCells(fromIdx, idx);
        }
      }
    }

    dragSource = null;
    dragOverIdx = null;
    dragOverZone = null;
  }

  function handlePoolZoneDragOver(e: DragEvent) {
    if (dragSource?.type === 'progression') {
      e.preventDefault();
      dragOverZone = 'pool';
    }
  }

  function handlePoolZoneDrop(e: DragEvent) {
    e.preventDefault();
    if (dragSource?.type === 'progression' && dragSource.idx !== undefined) {
      progression.returnFromProgression(dragSource.idx);
    }
    dragSource = null;
    dragOverIdx = null;
    dragOverZone = null;
  }

  function handleDragEnd() {
    dragSource = null;
    dragOverIdx = null;
    dragOverZone = null;
  }

  function handlePoolPush(key: string) {
    progression.pushFromPool(key);
  }

  function handleReturnFromProgression(idx: number) {
    progression.returnFromProgression(idx);
  }

  function handleDeleteFromPool(key: string) {
    // Also clear from progression
    for (let i = 0; i < progression.cells.length; i++) {
      if (progression.cells[i].poolKey === key) {
        progression.returnFromProgression(i);
      }
    }
    pool.remove(key);
  }

  function handleInsertCell(idx: number) {
    progression.insertCellAt(idx);
  }

  function handleDeleteCell(idx: number) {
    progression.deleteCellAt(idx);
  }

  function handleAddMoreCells() {
    const cols = isMobile ? 2 : 4;
    progression.addMoreCells(cols);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="progression-root">
  {#if pool.entries.length === 0}
    <!-- Empty state -->
    <div class="empty-state">
      <div class="empty-icon">🎸</div>
      <h2>Quick add chords</h2>
      <p>Type a chord name to add its best voicing to the pool, or browse chords in other modules.</p>
      <div class="quick-search-wrapper quick-search-center">
        <input
          class="quick-search-input"
          type="text"
          placeholder="e.g. Am7, Cmaj7, G…"
          value={quickSearch}
          oninput={(e) => updateQuickResults((e.target as HTMLInputElement).value)}
          onfocus={() => { if (quickResults.length > 0) quickDropdownOpen = true; }}
          onblur={handleQuickBlur}
          onkeydown={handleQuickKeydown}
        />
        {#if quickDropdownOpen}
          <div class="quick-dropdown">
            {#each quickResults as entry (entry.symbol)}
              <div class="quick-item">
                <span class="quick-item-name">{displayAccidental(entry.symbol)}</span>
                <span class="quick-item-type">{entry.typeName}</span>
                <div class="quick-item-actions">
                  <button
                    class="quick-action-btn add"
                    title="Add best voicing to pool"
                    disabled={quickAddingSymbol === entry.symbol}
                    onclick={() => handleQuickAdd(entry)}
                  >+</button>
                  <button
                    class="quick-action-btn go"
                    title="Browse voicings"
                    onclick={() => handleQuickNavigate(entry)}
                  >→</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="empty-actions">
        {#if onNavigateToFinder}
          <button class="btn btn-secondary" onclick={onNavigateToFinder}>Chord Finder</button>
        {/if}
        {#if onNavigateToIdentifier}
          <button class="btn btn-secondary" onclick={onNavigateToIdentifier}>Chord Identifier</button>
        {/if}
        {#if onNavigateToShapes}
          <button class="btn btn-secondary" onclick={onNavigateToShapes}>Shape Explorer</button>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Two-column layout: pool | progression -->
    <div class="builder-layout">
      <!-- Pool column -->
      <div class="pool-column" class:collapsed={isMobile && poolCollapsed}
        ondragover={handlePoolZoneDragOver}
        ondrop={handlePoolZoneDrop}
        class:drag-over={dragOverZone === 'pool'}
      >
        <div class="pool-header">
          <span class="pool-title">Pool</span>
          <span class="pool-count">{pool.entries.length}</span>
          {#if isMobile}
            <button class="pool-close-btn" onclick={() => poolCollapsed = true} aria-label="Close pool">
              ✕
            </button>
          {/if}
        </div>
        <div class="quick-search-wrapper quick-search-pool">
          <input
            class="quick-search-input"
            type="text"
            placeholder="Quick add…"
            value={quickSearch}
            oninput={(e) => updateQuickResults((e.target as HTMLInputElement).value)}
            onfocus={() => { if (quickResults.length > 0) quickDropdownOpen = true; }}
            onblur={handleQuickBlur}
            onkeydown={handleQuickKeydown}
          />
          {#if quickDropdownOpen}
            <div class="quick-dropdown">
              {#each quickResults as entry (entry.symbol)}
                <div class="quick-item">
                  <span class="quick-item-name">{displayAccidental(entry.symbol)}</span>
                  <span class="quick-item-type">{entry.typeName}</span>
                  <div class="quick-item-actions">
                    <button
                      class="quick-action-btn add"
                      title="Add best voicing to pool"
                      disabled={quickAddingSymbol === entry.symbol}
                      onclick={() => handleQuickAdd(entry)}
                    >+</button>
                    <button
                      class="quick-action-btn go"
                      title="Browse voicings"
                      onclick={() => handleQuickNavigate(entry)}
                    >→</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <div class="quick-nav-buttons">
          {#if onNavigateToFinder}
            <button class="btn btn-small btn-secondary" onclick={onNavigateToFinder}>Chord Finder</button>
          {/if}
          {#if onNavigateToIdentifier}
            <button class="btn btn-small btn-secondary" onclick={onNavigateToIdentifier}>Chord Identifier</button>
          {/if}
        </div>
        <div class="pool-list">
          {#each pool.entries as entry (entry.key)}
            <div
              class="pool-card"
              draggable={!isMobile}
              ondragstart={(e) => handlePoolDragStart(e, entry)}
              ondragend={handleDragEnd}
            >
              <div class="pool-card-diagram">
                <MiniChordDiagram voicing={entry.voicing} tuning={entry.tuning} />
              </div>
              <div class="pool-card-info">
                <span class="pool-card-name">{displayAccidental(entry.chordName)}</span>
              </div>
              <div class="pool-card-actions">
                <button
                  class="pool-action-btn"
                  title="Add to progression"
                  onclick={() => handlePoolPush(entry.key)}
                >›</button>
                <button
                  class="pool-action-btn delete"
                  title="Delete from pool"
                  onclick={() => handleDeleteFromPool(entry.key)}
                >✕</button>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Progression column -->
      <div class="progression-column">
        <div class="progression-header">
          {#if isMobile}
            <button class="pool-toggle" onclick={() => poolCollapsed = false} aria-label="Open pool">
              <span class="pool-toggle-icon">▶</span>
              <span class="pool-toggle-badge">{pool.entries.length}</span>
            </button>
          {/if}
          <input
            class="progression-title-input"
            type="text"
            value={progression.title}
            oninput={(e) => progression.setTitle((e.target as HTMLInputElement).value)}
          />
          {#if selectMode && selectedCells.size > 0}
            <button class="btn btn-small" onclick={duplicateSelected} disabled={!selectionContiguous} title={selectionContiguous ? '' : 'Select contiguous cells to duplicate'}>
              Duplicate ({selectedCells.size})
            </button>
            <button class="btn btn-small btn-danger" onclick={deleteSelected}>
              Delete ({selectedCells.size})
            </button>
          {/if}
          <div class="header-right-group">
            <button
              class="btn btn-small btn-secondary btn-fixed-select"
              class:btn-active={selectMode}
              onclick={toggleSelectMode}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
            <button
              class="btn btn-small btn-secondary"
              onclick={handleExportPdf}
              disabled={exporting}
              title="Export as PDF"
            >
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
            <button
              class="btn btn-small btn-secondary btn-fixed-share"
              onclick={handleGenerateUrl}
              title="Copy shareable URL to clipboard"
            >
              {urlCopied ? 'Copied!' : 'Share URL'}
            </button>
          </div>
        </div>

        <div
          bind:this={progressionGridEl}
          class="progression-grid"
          class:mobile={isMobile}
          onpointerup={endSweep}
          onpointerleave={endSweep}
        >
          {#each progression.cells as cell, idx (cell.id)}
            {@const entry = cell.poolKey ? pool.get(cell.poolKey) : undefined}
            {@const isMoving = moveFromIdx === idx}
            {@const isSelected = selectedCells.has(idx)}
            {@const isDragOver = dragOverIdx === idx}

            <div class="grid-cell-wrapper">
              <!-- Insert cell button (before this cell) -->
              {#if idx % (isMobile ? 2 : 4) === 0 || idx === 0}
                <!-- Row start: no left insert button -->
              {/if}

              <div
                class="grid-cell"
                class:filled={!!entry}
                class:moving={isMoving}
                class:selected={isSelected}
                class:drag-over={isDragOver}
                class:select-mode={selectMode}
                draggable={!isMobile && !!entry && !selectMode}
                ondragstart={(e) => handleCellDragStart(e, idx)}
                ondragover={(e) => handleCellDragOver(e, idx)}
                ondrop={(e) => handleCellDrop(e, idx)}
                ondragleave={() => { if (dragOverIdx === idx) dragOverIdx = null; }}
                ondragend={handleDragEnd}
                onclick={() => handleCellClick(idx)}
                onpointerdown={() => startSweep(idx)}
                onpointerenter={() => sweepOver(idx)}
                onmouseenter={() => { if (!entry) showCellQuick(idx); }}
                onmouseleave={() => { if (!entry) hideCellQuick(idx); }}
                role="button"
                tabindex="0"
              >
                {#if entry}
                  <div class="cell-content">
                    <div class="cell-diagram">
                      <MiniChordDiagram voicing={entry.voicing} tuning={entry.tuning} />
                    </div>
                    <div class="cell-info">
                      <span class="cell-name">{displayAccidental(entry.chordName)}</span>
                      {#if !selectMode}
                        <button
                          class="cell-action-btn"
                          title="Remove from progression"
                          onclick={(e) => { e.stopPropagation(); handleReturnFromProgression(idx); }}
                        >‹</button>
                      {/if}
                    </div>
                  </div>
                  <button
                    class="cell-remove-btn"
                    title="Delete cell"
                    onclick={(e) => { e.stopPropagation(); handleDeleteCell(idx); }}
                  >−</button>
                {:else}
                  <div class="cell-empty">
                    {#if cellQuickIdx === idx}
                      <div class="cell-quick-wrapper">
                        <input
                          class="cell-quick-input"
                          type="text"
                          placeholder="Search chord…"
                          value={cellQuickSearch}
                          oninput={(e) => updateCellQuickResults((e.target as HTMLInputElement).value)}
                          onkeydown={handleCellQuickKeydown}
                          onclick={(e) => e.stopPropagation()}
                          autofocus
                        />
                        {#if cellQuickOpen}
                          <div class="cell-quick-dropdown" use:positionDropdown>
                            {#each cellQuickResults as result}
                              <div class="cell-quick-item">
                                <span class="cell-quick-name">{displayAccidental(result.symbol)}</span>
                                <span class="cell-quick-type">{result.typeName}</span>
                                <div class="cell-quick-item-actions">
                                  <button
                                    class="quick-action-btn add"
                                    title="Add to pool & place here"
                                    disabled={cellQuickAdding === result.symbol}
                                    onclick={(e) => { e.stopPropagation(); handleCellQuickAdd(result, idx); }}
                                  >+</button>
                                  <button
                                    class="quick-action-btn go"
                                    title="Browse voicings"
                                    onclick={(e) => { e.stopPropagation(); handleQuickNavigate(result); }}
                                  >→</button>
                                </div>
                              </div>
                            {/each}
                          </div>
                        {/if}
                        <div class="cell-quick-nav">
                          {#if onNavigateToFinder}
                            <button class="cell-quick-nav-btn" onclick={(e) => { e.stopPropagation(); onNavigateToFinder?.(); }}>Finder</button>
                          {/if}
                          {#if onNavigateToIdentifier}
                            <button class="cell-quick-nav-btn" onclick={(e) => { e.stopPropagation(); onNavigateToIdentifier?.(); }}>Identifier</button>
                          {/if}
                        </div>
                      </div>
                    {:else}
                      <span class="cell-empty-label">+</span>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Insert cell gutter -->
              <button
                class="cell-insert-btn"
                title="Insert cell"
                onclick={(e) => { e.stopPropagation(); handleInsertCell(idx + 1); }}
              >+</button>
            </div>
          {/each}
        </div>

        <button class="btn btn-secondary add-more-btn" onclick={handleAddMoreCells}>
          + Add Row
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .progression-root {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  /* === Empty State === */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    text-align: center;
  }
  .empty-icon {
    font-size: 48px;
  }
  .empty-state h2 {
    margin: 0;
    font-size: 20px;
    color: var(--text);
  }
  .empty-state p {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
    max-width: 400px;
  }
  .empty-actions {
    display: flex;
    gap: 10px;
    margin-top: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* === Quick Search === */
  .quick-search-wrapper {
    position: relative;
    width: 100%;
  }
  .quick-search-center {
    max-width: 340px;
    margin-top: 8px;
  }
  .quick-search-pool {
    padding: 6px 8px;
    flex-shrink: 0;
  }
  .quick-search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }
  .quick-search-input:focus {
    border-color: var(--accent);
  }
  .quick-search-pool .quick-search-input {
    padding: 6px 10px;
    font-size: 13px;
  }
  .quick-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-top: 2px;
    z-index: 30;
    max-height: 280px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .quick-search-pool .quick-dropdown {
    left: 8px;
    right: 8px;
  }
  .quick-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }
  .quick-item:last-child {
    border-bottom: none;
  }
  .quick-item-name {
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
  }
  .quick-item-type {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .quick-item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .quick-action-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    transition: all 0.12s;
  }
  .quick-action-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .quick-action-btn.add:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg));
  }
  .quick-action-btn.go:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* === Two-Column Layout === */
  .builder-layout {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  /* === Pool Column === */
  .pool-column {
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    overflow: hidden;
    transition: width 0.2s, opacity 0.2s;
  }
  .pool-column.collapsed {
    width: 0;
    opacity: 0;
    pointer-events: none;
  }
  .pool-column.drag-over {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .pool-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .pool-title {
    font-weight: 600;
    font-size: 14px;
  }
  .pool-count {
    background: var(--accent);
    color: var(--bg);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 10px;
  }
  .quick-nav-buttons {
    display: flex;
    gap: 6px;
    padding: 6px 12px;
    flex-shrink: 0;
  }
  .quick-nav-buttons .btn {
    flex: 1;
    font-size: 11px;
  }

  .pool-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pool-card {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: grab;
  }
  .pool-card:active {
    cursor: grabbing;
  }
  .pool-card-diagram {
    flex-shrink: 0;
  }
  .pool-card-info {
    flex: 1;
    min-width: 0;
  }
  .pool-card-name {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pool-card-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .pool-action-btn {
    width: 22px;
    height: 22px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text-muted);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
  }
  .pool-action-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .pool-action-btn.delete:hover {
    border-color: var(--error);
    color: var(--error);
  }

  /* Mobile pool toggle */
  .pool-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-card);
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .pool-toggle-icon {
    font-size: 10px;
  }
  .pool-toggle-badge {
    background: var(--accent);
    color: var(--bg);
    font-size: 10px;
    font-weight: 600;
    padding: 0 5px;
    border-radius: 8px;
  }
  .pool-close-btn {
    margin-left: auto;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 14px;
    padding: 2px 8px;
    cursor: pointer;
    line-height: 1;
  }
  .pool-close-btn:hover {
    background: color-mix(in srgb, var(--text-muted) 15%, var(--bg));
  }

  /* === Progression Column === */
  .progression-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .progression-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .progression-title {
    font-weight: 600;
    font-size: 14px;
    margin-right: auto;
  }
  .progression-title-input {
    font-weight: 600;
    font-size: 18px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    border-radius: 4px;
    color: var(--text);
    padding: 4px 8px;
    min-width: 0;
    max-width: 240px;
    outline: none;
  }
  .progression-title-input:hover {
    border-color: var(--border);
  }
  .progression-title-input:focus {
    border-color: var(--accent);
    background: var(--bg);
  }

  .header-right-group {
    margin-left: auto;
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .btn-fixed-select {
    min-width: 60px;
    text-align: center;
  }
  .btn-fixed-share {
    width: 82px;
    text-align: center;
    box-sizing: border-box;
    white-space: nowrap;
  }

  .btn-active {
    background: var(--accent) !important;
    color: var(--bg) !important;
    border-color: var(--accent) !important;
  }

  .btn-danger {
    background: var(--error) !important;
    color: #fff !important;
    border-color: var(--error) !important;
  }
  .btn-danger:hover {
    filter: brightness(1.15);
  }

  /* === Progression Grid === */
  .progression-grid {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    align-content: start;
  }
  .progression-grid.mobile {
    grid-template-columns: repeat(2, 1fr);
  }

  /* Export mode: white bg, dark text, hide interactive elements */
  .progression-grid.exporting {
    background: #ffffff !important;
    color: #222 !important;
    --nut-color: #333;
    --fret-color: #999;
    --string-color: #b08060;
    --dot-bg: #d4874d;
    --dot-text: #000;
    --root-bg: #cc4444;
    --text-muted: #666;
    --border: #ccc;
  }
  .progression-grid.exporting .grid-cell {
    border-color: #ccc !important;
    background: #fff !important;
    color: #222 !important;
  }
  .progression-grid.exporting .cell-name {
    color: #222 !important;
  }
  .progression-grid.exporting .cell-remove-btn,
  .progression-grid.exporting .cell-insert-btn,
  .progression-grid.exporting .cell-action-btn,
  .progression-grid.exporting .cell-empty {
    display: none !important;
  }

  .grid-cell-wrapper {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .grid-cell {
    flex: 1;
    height: 120px;
    border: 1px dashed var(--border);
    border-radius: 6px;
    margin: 2px;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    position: relative;
    overflow: visible;
  }
  .grid-cell.filled {
    border-style: solid;
    cursor: grab;
  }
  .grid-cell.filled:active {
    cursor: grabbing;
  }
  .grid-cell.moving {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .grid-cell.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .grid-cell.drag-over {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .grid-cell:hover {
    border-color: var(--text-muted);
  }
  .grid-cell.select-mode {
    cursor: pointer;
    touch-action: none;
    user-select: none;
  }

  .cell-content {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    overflow: hidden;
  }
  .cell-diagram {
    pointer-events: none;
    flex-shrink: 0;
  }
  .cell-diagram :global(.mini-chord-svg) {
    width: 68px;
    height: auto;
  }
  .cell-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .cell-name {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
  }
  .cell-empty-label {
    color: var(--text-muted);
    font-size: 18px;
    opacity: 0.3;
  }

  .cell-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cell-quick-wrapper {
    position: relative;
    width: 90%;
  }
  .cell-quick-nav {
    display: flex;
    gap: 4px;
    margin-top: 4px;
    justify-content: center;
  }
  .cell-quick-nav-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-muted);
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .cell-quick-nav-btn:hover {
    background: color-mix(in srgb, var(--accent) 15%, var(--bg));
    color: var(--text);
  }
  .cell-quick-input {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }
  .cell-quick-input:focus {
    border-color: var(--accent);
  }
  .cell-quick-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 180px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-top: 2px;
    z-index: 40;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .cell-quick-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: none;
    border-bottom: 1px solid var(--border);
    background: none;
    color: var(--text);
    width: 100%;
    text-align: left;
    font-size: 12px;
  }
  .cell-quick-item:last-child {
    border-bottom: none;
  }
  .cell-quick-item:hover {
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  }
  .cell-quick-item-actions {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .cell-quick-name {
    font-weight: 600;
    white-space: nowrap;
  }
  .cell-quick-type {
    flex: 1;
    min-width: 0;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-action-btn {
    width: 20px;
    height: 20px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
  }
  .cell-action-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Cell remove (delete cell) & insert buttons */
  .cell-remove-btn {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0;
    transition: opacity 0.15s;
    line-height: 1;
  }
  .grid-cell:hover .cell-remove-btn {
    opacity: 0.4;
  }
  .cell-remove-btn:hover {
    opacity: 1 !important;
    color: var(--error);
  }

  .cell-insert-btn {
    position: absolute;
    right: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 2;
    line-height: 1;
  }
  .grid-cell-wrapper:hover .cell-insert-btn {
    opacity: 0.3;
  }
  .cell-insert-btn:hover {
    opacity: 1 !important;
    color: var(--accent);
    background: var(--bg-card);
    border: 1px solid var(--accent);
  }

  /* Add More button */
  .add-more-btn {
    margin: 8px 12px 12px;
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .pool-column {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 20;
      background: var(--bg);
      border-right: 1px solid var(--border);
      box-shadow: 2px 0 8px rgba(0,0,0,0.15);
    }
    .pool-column.collapsed {
      width: 0;
      box-shadow: none;
    }
  }
</style>
