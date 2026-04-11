import type { Voicing } from './voicings';
import type { Tuning } from './tunings';
import { STANDARD, ALL_TUNINGS } from './tunings';

export interface PoolEntry {
  voicing: Voicing;
  tuning: Tuning;
  chordName: string;
  key: string;
}

function makeKey(frets: number[]): string {
  return frets.map(f => (f === -1 ? 'x' : String(f))).join(',');
}

const STORAGE_KEY = 'guitar-app-pool';

interface StoredEntry {
  frets: number[];
  tuningName: string;
  chordName: string;
  voicing: Voicing;
}

class VoicingPool {
  entries: PoolEntry[] = $state([]);
  private keySet = new Set<string>();

  constructor() {
    this.hydrate();
  }

  has(key: string): boolean {
    return this.keySet.has(key);
  }

  hasByFrets(frets: number[]): boolean {
    return this.keySet.has(makeKey(frets));
  }

  add(voicing: Voicing, tuning: Tuning, chordName: string) {
    const key = makeKey(voicing.frets);
    if (this.keySet.has(key)) return;
    this.keySet.add(key);
    this.entries.push({ voicing, tuning, chordName, key });
    this.persist();
  }

  remove(key: string) {
    const idx = this.entries.findIndex(e => e.key === key);
    if (idx === -1) return;
    this.keySet.delete(key);
    this.entries.splice(idx, 1);
    this.persist();
  }

  get(key: string): PoolEntry | undefined {
    return this.entries.find(e => e.key === key);
  }

  clear() {
    this.entries.length = 0;
    this.keySet.clear();
    this.persist();
  }

  keyFor(frets: number[]): string {
    return makeKey(frets);
  }

  private persist() {
    try {
      const data: StoredEntry[] = this.entries.map(e => ({
        frets: e.voicing.frets,
        tuningName: e.tuning.name,
        chordName: e.chordName,
        voicing: e.voicing,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage may be unavailable
    }
  }

  private hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: StoredEntry[] = JSON.parse(raw);
      for (const d of data) {
        const tuning = ALL_TUNINGS.find(t => t.name === d.tuningName) ?? STANDARD;
        const key = makeKey(d.voicing.frets);
        if (!this.keySet.has(key)) {
          this.keySet.add(key);
          this.entries.push({ voicing: d.voicing, tuning, chordName: d.chordName, key });
        }
      }
    } catch {
      // corrupt data — start fresh
    }
  }
}

export const pool = new VoicingPool();
