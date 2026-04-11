import { ALL_TUNINGS, STANDARD } from './tunings';
import type { Tuning } from './tunings';

const STORAGE_KEY = 'guitar-app-fretboard-map';

interface StoredState {
  tuningName: string;
  mode: 'notes' | 'intervals';
  rootNote: string;
}

class FretboardMapState {
  selectedTuning: Tuning = $state(STANDARD);
  mode: 'notes' | 'intervals' = $state('notes');
  rootNote: string = $state('C');

  constructor() {
    this.hydrate();
  }

  setTuning(tuning: Tuning) {
    this.selectedTuning = tuning;
    this.persist();
  }

  setMode(mode: 'notes' | 'intervals') {
    this.mode = mode;
    this.persist();
  }

  setRootNote(note: string) {
    this.rootNote = note;
    this.persist();
  }

  private persist() {
    try {
      const data: StoredState = {
        tuningName: this.selectedTuning.name,
        mode: this.mode,
        rootNote: this.rootNote,
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
      if (data.mode === 'notes' || data.mode === 'intervals') this.mode = data.mode;
      if (data.rootNote) this.rootNote = data.rootNote;
    } catch {}
  }
}

export const fretboardMapState = new FretboardMapState();
