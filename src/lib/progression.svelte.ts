import { pool, type PoolEntry } from './pool.svelte';
import { ALL_TUNINGS, STANDARD } from './tunings';

export interface ProgressionCell {
  id: string;
  poolKey: string | null;
}

const STORAGE_KEY = 'guitar-app-progression';
const TITLE_KEY = 'guitar-app-progression-title';
const DEFAULT_CELL_COUNT = 16;

let nextId = 1;
function genId(): string {
  return `cell-${nextId++}`;
}

function makeEmptyCell(): ProgressionCell {
  return { id: genId(), poolKey: null };
}

function makeCells(count: number): ProgressionCell[] {
  return Array.from({ length: count }, () => makeEmptyCell());
}

export class ProgressionState {
  cells: ProgressionCell[] = $state([]);
  title: string = $state('My Progression');
  columns = 4;

  /** When set, the next "add to progression" should target this cell index */
  pendingCellIdx: number | null = $state(null);

  /** When set to a tab name, App.svelte navigates there and clears it */
  pendingNav: string | null = $state(null);

  constructor() {
    this.hydrate();
    if (this.cells.length === 0) {
      this.cells = makeCells(DEFAULT_CELL_COUNT);
    }
  }

  setTitle(t: string) {
    this.title = t;
    try { localStorage.setItem(TITLE_KEY, t); } catch {}
  }

  /** Push a pool entry into the first empty cell, or append a new cell */
  pushFromPool(poolKey: string) {
    const emptyIdx = this.cells.findIndex(c => c.poolKey === null);
    if (emptyIdx !== -1) {
      this.cells[emptyIdx] = { ...this.cells[emptyIdx], poolKey };
      // Auto-add an empty cell if the last cell was just filled
      if (emptyIdx === this.cells.length - 1) {
        this.cells.push(makeEmptyCell());
      }
    } else {
      this.cells.push({ id: genId(), poolKey }, makeEmptyCell());
    }
    this.persist();
  }

  /** Push a pool entry into a specific cell index */
  pushToCell(poolKey: string, idx: number) {
    if (idx < 0 || idx >= this.cells.length) return;
    if (this.cells[idx].poolKey !== null) return; // cell occupied
    this.cells[idx] = { ...this.cells[idx], poolKey };
    // Auto-add an empty cell if the last cell was just filled
    if (idx === this.cells.length - 1) {
      this.cells.push(makeEmptyCell());
    }
    this.persist();
  }

  /** Return a voicing from progression back (clear the cell content, pool is unchanged) */
  returnFromProgression(idx: number) {
    if (idx < 0 || idx >= this.cells.length) return;
    this.cells[idx] = { ...this.cells[idx], poolKey: null };
    this.persist();
  }

  /** Swap two cells' contents */
  swapCells(a: number, b: number) {
    if (a === b) return;
    if (a < 0 || a >= this.cells.length || b < 0 || b >= this.cells.length) return;
    const keyA = this.cells[a].poolKey;
    this.cells[a] = { ...this.cells[a], poolKey: this.cells[b].poolKey };
    this.cells[b] = { ...this.cells[b], poolKey: keyA };
    this.persist();
  }

  /** Move a voicing from one cell to an empty cell */
  moveToEmpty(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    if (this.cells[toIdx].poolKey !== null) return; // target not empty
    this.cells[toIdx] = { ...this.cells[toIdx], poolKey: this.cells[fromIdx].poolKey };
    this.cells[fromIdx] = { ...this.cells[fromIdx], poolKey: null };
    this.persist();
  }

  /** Remove cell at fromIdx and insert it before toIdx */
  relocateCell(fromIdx: number, toIdx: number) {
    if (fromIdx < 0 || fromIdx >= this.cells.length) return;
    const cell = this.cells[fromIdx];
    this.cells.splice(fromIdx, 1);
    // Adjust target index since array shifted
    const adjustedTo = toIdx > fromIdx ? toIdx - 1 : toIdx;
    this.cells.splice(adjustedTo, 0, cell);
    this.persist();
  }

  /** Insert an empty cell at idx, shifting later cells right */
  insertCellAt(idx: number) {
    if (idx < 0 || idx > this.cells.length) return;
    this.cells.splice(idx, 0, makeEmptyCell());
    this.persist();
  }

  /** Delete a cell at idx, shifting later cells left */
  deleteCellAt(idx: number) {
    if (idx < 0 || idx >= this.cells.length) return;
    this.cells.splice(idx, 1);
    this.persist();
  }

  /** Duplicate a cell at idx, inserting the copy right after it */
  duplicateCellAt(idx: number) {
    if (idx < 0 || idx >= this.cells.length) return;
    const cell = this.cells[idx];
    this.cells.splice(idx + 1, 0, { id: genId(), poolKey: cell.poolKey });
    this.persist();
  }

  /** Add empty cells to fill the current row, then add a full next row */
  addMoreCells(cols: number) {
    const partial = this.cells.length % cols;
    const toFillRow = partial === 0 ? 0 : cols - partial;
    this.cells.push(...makeCells(toFillRow + cols));
    this.persist();
  }

  /** Duplicate selected cells: insert copies in front of the first selected index */
  duplicateSelection(indices: number[]) {
    if (indices.length === 0) return;
    const sorted = [...indices].sort((a, b) => a - b);
    const keys = sorted.map(i => this.cells[i]?.poolKey).filter((k): k is string => k !== null);
    if (keys.length === 0) return;
    // Insert duplicated cells before the first selected index
    const insertAt = sorted[0];
    const newCells = keys.map(k => ({ id: genId(), poolKey: k }));
    this.cells.splice(insertAt, 0, ...newCells);
    this.persist();
  }

  /** Delete multiple cells by indices (sorted descending for safe splice) */
  deleteSelection(indices: number[]) {
    const sorted = [...indices].sort((a, b) => b - a);
    for (const idx of sorted) {
      if (idx >= 0 && idx < this.cells.length) {
        this.cells.splice(idx, 1);
      }
    }
    this.persist();
  }

  /** Move selected cells as a group to a target position */
  moveSelection(indices: number[], targetIdx: number) {
    if (indices.length === 0) return;
    // Extract the pool keys from selected cells
    const sorted = [...indices].sort((a, b) => a - b);
    const keys = sorted.map(i => this.cells[i].poolKey);
    // Clear source cells
    for (const i of sorted) {
      this.cells[i] = { ...this.cells[i], poolKey: null };
    }
    // Insert at target: fill empty cells starting from targetIdx
    let insertPos = targetIdx;
    for (const key of keys) {
      while (insertPos < this.cells.length && this.cells[insertPos].poolKey !== null) {
        insertPos++;
      }
      if (insertPos >= this.cells.length) {
        this.cells.push({ id: genId(), poolKey: key });
      } else {
        this.cells[insertPos] = { ...this.cells[insertPos], poolKey: key };
      }
      insertPos++;
    }
    this.persist();
  }

  /** Relocate selected cells as a contiguous block to a new position. Returns new start index. */
  relocateSelection(indices: number[], targetIdx: number): number {
    if (indices.length === 0) return targetIdx;
    const sorted = [...indices].sort((a, b) => a - b);
    // Extract cells in order
    const extracted = sorted.map(i => this.cells[i]);
    // Remove from array (descending to preserve indices)
    for (let i = sorted.length - 1; i >= 0; i--) {
      this.cells.splice(sorted[i], 1);
    }
    // Adjust target: count how many removed cells were before targetIdx
    let adjusted = targetIdx;
    for (const i of sorted) {
      if (i < targetIdx) adjusted--;
    }
    adjusted = Math.max(0, Math.min(adjusted, this.cells.length));
    // Insert block
    this.cells.splice(adjusted, 0, ...extracted);
    this.persist();
    return adjusted;
  }

  /** Check if a pool key is already in the progression */
  hasPoolKey(poolKey: string): boolean {
    return this.cells.some(c => c.poolKey === poolKey);
  }

  /** Remove all occurrences of a pool key from the progression */
  removePoolKey(poolKey: string) {
    let changed = false;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i].poolKey === poolKey) {
        this.cells[i] = { ...this.cells[i], poolKey: null };
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  /** Get the PoolEntry for a cell */
  getEntry(idx: number): PoolEntry | undefined {
    const key = this.cells[idx]?.poolKey;
    if (!key) return undefined;
    return pool.get(key);
  }

  /** Serialize current state for URL sharing */
  toSnapshot(): { title: string; poolEntries: { frets: number[]; tuningName: string; chordName: string; voicing: any }[]; cells: (string | null)[] } {
    // Collect only pool entries referenced by the progression
    const usedKeys = new Set(this.cells.map(c => c.poolKey).filter((k): k is string => k !== null));
    const poolEntries = [...usedKeys].map(key => {
      const e = pool.get(key)!;
      return { frets: e.voicing.frets, tuningName: e.tuning.name, chordName: e.chordName, voicing: e.voicing };
    });
    return {
      title: this.title,
      poolEntries,
      cells: this.cells.map(c => c.poolKey),
    };
  }

  /** Compact URL encoding: "title|name.frets,name.frets|cellIndices" */
  toCompactUrl(): string {
    // Collect unique pool keys used in cells (preserving order)
    const usedKeys: string[] = [];
    const keyIndex = new Map<string, number>();
    for (const c of this.cells) {
      if (c.poolKey && !keyIndex.has(c.poolKey)) {
        keyIndex.set(c.poolKey, usedKeys.length);
        usedKeys.push(c.poolKey);
      }
    }
    // Encode each chord: chordName.fretString
    const chords = usedKeys.map(key => {
      const e = pool.get(key)!;
      const fretStr = e.voicing.frets.map((f: number) => f === -1 ? 'x' : f.toString(16)).join('');
      return e.chordName + '.' + fretStr;
    });
    // Encode cells: trim trailing empties, use index or _ for empty
    let lastFilled = -1;
    for (let i = this.cells.length - 1; i >= 0; i--) {
      if (this.cells[i].poolKey !== null) { lastFilled = i; break; }
    }
    const cellParts: string[] = [];
    for (let i = 0; i <= lastFilled; i++) {
      const pk = this.cells[i].poolKey;
      cellParts.push(pk ? keyIndex.get(pk)!.toString(36) : '_');
    }
    return [this.title, chords.join(','), cellParts.join('')].join('|');
  }

  /** Decode compact URL format */
  static fromCompactUrl(encoded: string): { title: string; chords: { chordName: string; frets: number[] }[]; cells: (number | null)[] } | null {
    const parts = encoded.split('|');
    if (parts.length !== 3) return null;
    const [title, chordsPart, cellsPart] = parts;
    const chords = chordsPart ? chordsPart.split(',').map(s => {
      const dotIdx = s.lastIndexOf('.');
      if (dotIdx === -1) return null;
      const chordName = s.slice(0, dotIdx);
      const fretStr = s.slice(dotIdx + 1);
      const frets = [...fretStr].map(ch => ch === 'x' ? -1 : parseInt(ch, 16));
      if (frets.some(f => isNaN(f))) return null;
      return { chordName, frets };
    }) : [];
    if (chords.some(c => c === null)) return null;
    const cells = [...cellsPart].map(ch => ch === '_' ? null : parseInt(ch, 36));
    if (cells.some(c => c !== null && isNaN(c as number))) return null;
    return { title, chords: chords as { chordName: string; frets: number[] }[], cells };
  }

  /** Load state from a URL snapshot */
  loadFromSnapshot(snap: { title: string; poolEntries: { frets: number[]; tuningName: string; chordName: string; voicing: any }[]; cells: (string | null)[] }) {
    // Import pool entries
    for (const pe of snap.poolEntries) {
      const tuning = ALL_TUNINGS.find(t => t.name === pe.tuningName) ?? STANDARD;
      pool.add(pe.voicing, tuning, pe.chordName);
    }
    // Build cells
    this.cells = snap.cells.map(poolKey => {
      let resolved: string | null = null;
      if (poolKey) {
        if (pool.has(poolKey)) {
          resolved = poolKey;
        } else {
          // Migration: try legacy frets-only key
          const legacy = pool.findByLegacyKey(poolKey);
          if (legacy) resolved = legacy.key;
        }
      }
      return { id: genId(), poolKey: resolved };
    });
    this.title = snap.title || 'My Progression';
    this.persist();
    try { localStorage.setItem(TITLE_KEY, this.title); } catch {}
  }

  persist() {
    try {
      const data = this.cells.map(c => ({ id: c.id, poolKey: c.poolKey }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage unavailable
    }
  }

  private hydrate() {
    try {
      const savedTitle = localStorage.getItem(TITLE_KEY);
      if (savedTitle) this.title = savedTitle;
    } catch {}
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: { id: string; poolKey: string | null }[] = JSON.parse(raw);
      // First pass: advance nextId past all stored IDs
      for (const d of data) {
        const m = d.id?.match(/^cell-(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n >= nextId) nextId = n + 1;
        }
      }
      // Second pass: build cells, reassigning duplicate IDs
      const seen = new Set<string>();
      this.cells = data.map(d => {
        let id = d.id || genId();
        if (seen.has(id)) {
          id = genId(); // replace duplicate with fresh ID
        }
        seen.add(id);
        let poolKey: string | null = null;
        if (d.poolKey) {
          if (pool.has(d.poolKey)) {
            poolKey = d.poolKey;
          } else {
            // Migration: try to find by legacy frets-only key
            const legacy = pool.findByLegacyKey(d.poolKey);
            if (legacy) poolKey = legacy.key;
          }
        }
        return { id, poolKey };
      });
      this.persist(); // save cleaned-up IDs
    } catch {
      // corrupt data — start fresh
    }
  }
}

export const progression = new ProgressionState();
