import { ALL_TUNINGS, STANDARD } from './tunings';
import type { Tuning } from './tunings';

const STORAGE_KEY = 'guitar-app-identifier';

interface StoredState {
  tuningName: string;
  positions: { string: number; fret: number }[];
}

class IdentifierState {
  selectedTuning: Tuning = $state(STANDARD);
  selectedPositions: { string: number; fret: number }[] = $state([]);

  constructor() {
    this.hydrate();
  }

  setTuning(tuning: Tuning) {
    this.selectedTuning = tuning;
    this.selectedPositions = [];
    this.persist();
  }

  togglePosition(stringIdx: number, fret: number) {
    const existing = this.selectedPositions.findIndex(
      p => p.string === stringIdx && p.fret === fret
    );
    if (existing !== -1) {
      this.selectedPositions = this.selectedPositions.filter((_, i) => i !== existing);
    } else {
      this.selectedPositions = [
        ...this.selectedPositions.filter(p => p.string !== stringIdx),
        { string: stringIdx, fret },
      ];
    }
    this.persist();
  }

  clear() {
    this.selectedPositions = [];
    this.persist();
  }

  private persist() {
    try {
      const data: StoredState = {
        tuningName: this.selectedTuning.name,
        positions: this.selectedPositions,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  private hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: StoredState = JSON.parse(raw);
      this.selectedTuning = ALL_TUNINGS.find(t => t.name === data.tuningName) ?? STANDARD;
      if (Array.isArray(data.positions)) {
        this.selectedPositions = data.positions;
      }
    } catch {}
  }
}

export const identifierState = new IdentifierState();
