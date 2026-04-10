export interface Tuning {
  name: string;
  notes: string[]; // from lowest (6th string) to highest (1st string)
}

export const STANDARD: Tuning = {
  name: 'Standard',
  notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
};

export const DROP_D: Tuning = {
  name: 'Drop D',
  notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
};

export const ALL_TUNINGS: Tuning[] = [STANDARD, DROP_D];
