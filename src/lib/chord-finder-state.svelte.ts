import { ALL_TUNINGS, STANDARD } from './tunings';
import type { Tuning } from './tunings';

const STORAGE_KEY = 'guitar-app-chord-finder';

interface StoredState {
  tuningName: string;
  phase: 'browse' | 'voicings';
  searchText: string;
  filterRoots: string[];
  filterKeys: string[];
  filterCategories: string[];
  filterVoicings: string[];
  filterScaleRoot: string;
  filterScaleMode: string;
  activeChordSymbol: string;
  showIntervals: boolean;
  selectedFretFilter: string | null;
  selectedIdx: number | null;
}

class ChordFinderState {
  selectedTuning: Tuning = $state(STANDARD);
  phase: 'browse' | 'voicings' = $state('browse');
  searchText: string = $state('');
  filterRoots: string[] = $state([]);
  filterKeys: string[] = $state([]);
  filterCategories: string[] = $state([]);
  filterVoicings: string[] = $state([]);
  filterScaleRoot: string = $state('');
  filterScaleMode: string = $state('');
  activeChordSymbol: string = $state('');
  showIntervals: boolean = $state(false);
  selectedFretFilter: string | null = $state(null);
  selectedIdx: number | null = $state(null);

  constructor() {
    this.hydrate();
  }

  persist() {
    try {
      const data: StoredState = {
        tuningName: this.selectedTuning.name,
        phase: this.phase,
        searchText: this.searchText,
        filterRoots: this.filterRoots,
        filterKeys: this.filterKeys,
        filterCategories: this.filterCategories,
        filterVoicings: this.filterVoicings,
        filterScaleRoot: this.filterScaleRoot,
        filterScaleMode: this.filterScaleMode,
        activeChordSymbol: this.activeChordSymbol,
        showIntervals: this.showIntervals,
        selectedFretFilter: this.selectedFretFilter,
        selectedIdx: this.selectedIdx,
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
      if (data.phase === 'browse' || data.phase === 'voicings') this.phase = data.phase;
      if (typeof data.searchText === 'string') this.searchText = data.searchText;
      if (Array.isArray(data.filterRoots)) this.filterRoots = data.filterRoots;
      if (Array.isArray(data.filterKeys)) this.filterKeys = data.filterKeys;
      if (Array.isArray(data.filterCategories)) this.filterCategories = data.filterCategories;
      if (Array.isArray(data.filterVoicings)) this.filterVoicings = data.filterVoicings;
      if (typeof data.filterScaleRoot === 'string') this.filterScaleRoot = data.filterScaleRoot;
      if (typeof data.filterScaleMode === 'string') this.filterScaleMode = data.filterScaleMode;
      if (typeof data.activeChordSymbol === 'string') this.activeChordSymbol = data.activeChordSymbol;
      if (typeof data.showIntervals === 'boolean') this.showIntervals = data.showIntervals;
      if (data.selectedFretFilter === null || typeof data.selectedFretFilter === 'string') this.selectedFretFilter = data.selectedFretFilter;
      if (data.selectedIdx === null || typeof data.selectedIdx === 'number') this.selectedIdx = data.selectedIdx;
    } catch {}
  }
}

export const chordFinderState = new ChordFinderState();
