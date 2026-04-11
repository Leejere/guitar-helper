import type { CAGEDShape } from './voicings';

const STORAGE_KEY = 'guitar-app-shape-explorer';

interface StoredState {
  filterShape: CAGEDShape | '';
  filterVariants: string[];
  selectedPosition: number | null;
  selectedResultIdx: number | null;
}

class ShapeExplorerState {
  filterShape: CAGEDShape | '' = $state('');
  filterVariants: string[] = $state([]);
  selectedPosition: number | null = $state(null);
  selectedResultIdx: number | null = $state(null);

  constructor() {
    this.hydrate();
  }

  persist() {
    try {
      const data: StoredState = {
        filterShape: this.filterShape,
        filterVariants: this.filterVariants,
        selectedPosition: this.selectedPosition,
        selectedResultIdx: this.selectedResultIdx,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  private hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: StoredState = JSON.parse(raw);
      if (typeof data.filterShape === 'string') this.filterShape = data.filterShape as CAGEDShape | '';
      if (Array.isArray(data.filterVariants)) this.filterVariants = data.filterVariants;
      if (data.selectedPosition === null || typeof data.selectedPosition === 'number') this.selectedPosition = data.selectedPosition;
      if (data.selectedResultIdx === null || typeof data.selectedResultIdx === 'number') this.selectedResultIdx = data.selectedResultIdx;
    } catch {}
  }
}

export const shapeExplorerState = new ShapeExplorerState();
