import { ChordType, Key, Chord, Note, Scale } from 'tonal';
import { formatChordName, normalizeInput } from './music';

export interface ChordEntry {
  /** Full chord symbol, e.g. "Cm7", "F#dim", "C/E" */
  symbol: string;
  /** Root note, e.g. "C", "F#" */
  root: string;
  /** Type symbol without root, e.g. "m7", "dim", "" for major */
  typeSuffix: string;
  /** Human-readable type name, e.g. "minor seventh" */
  typeName: string;
  /** Category for filtering */
  category: ChordCategory;
  /** Keys (major and relative minor) this chord is diatonic to */
  keys: string[];
  /** Bass note for slash chords, undefined for root position */
  bassNote?: string;
}

export type ChordCategory =
  | 'Major'
  | 'Minor'
  | 'Dominant'
  | 'Diminished'
  | 'Augmented'
  | 'Suspended'
  | 'Extended'
  | 'Altered'
  | 'Other';

const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

// Curated list of chord types that are practically useful on guitar
const CHORD_TYPE_SYMBOLS = [
  // Basic triads
  'M', 'm', 'dim', 'aug', '5',
  // Suspended
  'sus2', 'sus4',
  // Seventh chords
  'maj7', '7', 'm7', 'm/ma7', 'dim7', 'm7b5', 'aug7',
  // Sixth chords
  '6', 'm6',
  // Ninth chords
  'maj9', '9', 'm9', 'add9', 'madd9',
  // Eleventh / Thirteenth
  '11', '13', 'm11', 'maj13', 'm13',
  // Suspended + 7
  '7sus4', '7sus2', 'M7sus4',
  // Altered dominants
  '7b5', '7#5', '7b9', '7#9', '7#5b9', 'alt7',
  // Add chords
  'maj#4', '6add9', 'm69',
];

function categorize(suffix: string): ChordCategory {
  if (/^sus/.test(suffix) || /sus\d/.test(suffix)) return 'Suspended';
  if (/^(9|11|13|maj9|maj11|maj13|m9|m11|m13|add9|madd9|6add9|m69)$/.test(suffix)) return 'Extended';
  if (/^(alt7|7b5|7#5|7b9|7#9|7#5b9|7b9b13|7#9#11|7#11)$/.test(suffix)) return 'Altered';
  if (/^(M|maj7|6|Madd9|maj#4)$/.test(suffix)) return 'Major';
  if (/^(m|m7|m6|m\/ma7|mMaj7)$/.test(suffix)) return 'Minor';
  if (/^(7|7sus4|7sus2|M7sus4|13)$/.test(suffix)) return 'Dominant';
  if (/^(dim|dim7|m7b5|o7)$/.test(suffix)) return 'Diminished';
  if (/^(aug|aug7|maj7#5|\+)$/.test(suffix)) return 'Augmented';
  if (suffix === '5') return 'Other';
  return 'Other';
}

/** Build the diatonic chord → key lookup */
function buildKeyMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  function addChord(chordSymbol: string, keyLabel: string) {
    const normalized = formatChordName(chordSymbol);
    if (!map.has(normalized)) map.set(normalized, new Set());
    map.get(normalized)!.add(keyLabel);

    // Also handle enharmonic roots: if chord starts with Db, also register as C#
    const ch = Chord.get(chordSymbol);
    if (ch.tonic) {
      const chroma = Note.chroma(ch.tonic);
      if (chroma !== undefined) {
        for (const root of ROOTS) {
          if (Note.chroma(root) === chroma && root !== ch.tonic) {
            const alt = root + (ch.aliases?.[0]?.replace(ch.tonic, '') ?? chordSymbol.slice(ch.tonic.length));
            const altNorm = formatChordName(alt);
            if (!map.has(altNorm)) map.set(altNorm, new Set());
            map.get(altNorm)!.add(keyLabel);
          }
        }
      }
    }
  }

  for (const keyRoot of ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']) {
    const major = Key.majorKey(keyRoot);
    if (!major || !major.triads) continue;
    const keyLabel = keyRoot;
    for (const c of [...major.triads, ...major.chords]) {
      if (c) addChord(c, keyLabel);
    }

    const minor = Key.minorKey(keyRoot);
    if (!minor) continue;
    const minKeyLabel = keyRoot + 'm';
    for (const sub of [minor.natural, minor.harmonic, minor.melodic]) {
      if (!sub) continue;
      for (const c of [...(sub.triads || []), ...(sub.chords || [])]) {
        if (c) addChord(c, minKeyLabel);
      }
    }
  }
  return map;
}

let _db: ChordEntry[] | null = null;
let _keyMap: Map<string, Set<string>> | null = null;

function getKeyMap(): Map<string, Set<string>> {
  if (!_keyMap) _keyMap = buildKeyMap();
  return _keyMap;
}

export function getChordDatabase(): ChordEntry[] {
  if (_db) return _db;
  const keyMap = getKeyMap();
  const entries: ChordEntry[] = [];
  const seen = new Set<string>();

  for (const suffix of CHORD_TYPE_SYMBOLS) {
    for (const root of ROOTS) {
      const raw = root + (suffix === 'M' ? '' : suffix);
      const symbol = formatChordName(raw);

      // Verify tonal can parse it
      const info = Chord.get(raw);
      if (!info || info.empty) continue;

      // Deduplicate enharmonic equivalents (keep both C# and Db versions)
      const key = `${root}|${suffix}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const cat = categorize(suffix);
      const keys = Array.from(keyMap.get(symbol) ?? []);

      entries.push({
        symbol,
        root,
        typeSuffix: suffix === 'M' ? '' : suffix,
        typeName: info.type || info.name || suffix,
        category: cat,
        keys,
      });
    }
  }

  _db = entries;

  // Generate slash chord (inversion) entries from base chords
  const slashEntries: ChordEntry[] = [];
  for (const entry of entries) {
    const raw = entry.root + (entry.typeSuffix || 'M');
    const info = Chord.get(raw);
    if (!info || info.empty || !info.notes || info.notes.length < 3) continue;

    // For each non-root chord tone, create a slash chord entry
    for (let i = 1; i < info.notes.length; i++) {
      const bass = info.notes[i];
      const slashSymbol = `${entry.symbol}/${bass}`;
      // Verify tonal can parse it
      const slashInfo = Chord.get(`${raw}/${bass}`);
      if (!slashInfo || slashInfo.empty) continue;

      slashEntries.push({
        symbol: slashSymbol,
        root: entry.root,
        typeSuffix: entry.typeSuffix,
        typeName: entry.typeName,
        category: entry.category,
        keys: entry.keys,
        bassNote: bass,
      });
    }
  }

  _db = [...entries, ...slashEntries];
  return _db;
}

export const ALL_CATEGORIES: ChordCategory[] = [
  'Major', 'Minor', 'Dominant', 'Diminished', 'Augmented', 'Suspended', 'Extended', 'Altered', 'Other',
];

export interface ChordFilters {
  search: string;
  roots: string[];       // [] = any
  keys: string[];        // [] = any
  categories: string[];  // [] = any
  voicings: string[];    // [] = any, values: 'root' | 'slash'
  scale: string;         // '' = any, or 'root mode' e.g. 'C dorian'
}

/**
 * Check if a search term matches a chord symbol, ignoring spurious flat-sign hits.
 * When the search starts with 'b', a match at position i is rejected if sym[i-1]
 * is a note letter (a-g), because that 'b' is a flat sign, not the note B.
 */
function symbolMatches(sym: string, search: string): boolean {
  let pos = 0;
  while (true) {
    const idx = sym.indexOf(search, pos);
    if (idx < 0) return false;
    // Reject if the 'b' at idx is actually a flat sign (preceded by a note letter)
    if (idx > 0 && search[0] === 'b' && /[a-g]/.test(sym[idx - 1])) {
      pos = idx + 1;
      continue; // keep looking for a non-spurious match
    }
    return true;
  }
}

/**
 * Compute search relevance score (lower = better match).
 * Priorities: exact match > starts-with > symbol contains > type name contains.
 * Root-position chords rank above slash chords at equal relevance.
 */
function searchRelevance(entry: ChordEntry, search: string): number {
  const sym = entry.symbol.toLowerCase();
  const slashPenalty = entry.bassNote ? 1000 : 0;

  if (sym === search) return 0 + slashPenalty;
  if (sym.startsWith(search)) return 100 + slashPenalty;
  if (symbolMatches(sym, search)) return 200 + slashPenalty;
  if (entry.typeName.toLowerCase().includes(search)) return 300 + slashPenalty;
  return 400 + slashPenalty;
}

export function filterChords(filters: ChordFilters): ChordEntry[] {
  const db = getChordDatabase();
  const search = normalizeInput(filters.search.trim()).toLowerCase();

  const rootChromas = filters.roots.map(r => Note.chroma(r));

  const results = db.filter(entry => {
    // Text search: match against symbol (case-insensitive)
    if (search) {
      const sym = entry.symbol.toLowerCase();
      if (!symbolMatches(sym, search) && !entry.typeName.toLowerCase().includes(search)) {
        return false;
      }
    }
    // Root filter (multi-select)
    if (rootChromas.length > 0 && !rootChromas.includes(Note.chroma(entry.root))) {
      return false;
    }
    // Key filter (multi-select)
    if (filters.keys.length > 0) {
      if (!entry.keys.some(k => filters.keys.includes(k))) {
        return false;
      }
    }
    // Category filter (multi-select)
    if (filters.categories.length > 0 && !filters.categories.includes(entry.category)) {
      return false;
    }
    // Voicing (root position / slash) filter (multi-select)
    if (filters.voicings.length > 0) {
      const isRoot = !entry.bassNote;
      const isSlash = !!entry.bassNote;
      const match = (filters.voicings.includes('root') && isRoot) || (filters.voicings.includes('slash') && isSlash);
      if (!match) return false;
    }
    // Scale/mode filter
    if (filters.scale) {
      const scaleSymbols = getScaleDiatonicSymbols(filters.scale);
      if (scaleSymbols && !scaleSymbols.has(entry.symbol)) {
        return false;
      }
    }
    return true;
  });

  // Sort by search relevance when a text query is present
  if (search) {
    results.sort((a, b) => searchRelevance(a, search) - searchRelevance(b, search));
  }

  return results;
}

/** Build list of keys for filter dropdown: C, Cm, C#, C#m, ... */
export function getAllKeys(): string[] {
  const keys: string[] = [];
  for (const root of ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']) {
    keys.push(root);
    keys.push(root + 'm');
  }
  return keys;
}

export const FILTER_ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

// ---- Scale / Mode support ----

export const SCALE_MODES = [
  'ionian',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'aeolian',
  'locrian',
  'harmonic minor',
  'melodic minor',
] as const;

export type ScaleMode = typeof SCALE_MODES[number];

const SCALE_ROOTS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Cache of scale key → set of diatonic chord symbols */
const _scaleChordCache = new Map<string, Set<string>>();

/**
 * Compute the diatonic triads and 7th chords for a given scale.
 * Builds chords by stacking thirds from each scale degree.
 */
function computeScaleDiatonicSymbols(scaleKey: string): Set<string> | null {
  const scale = Scale.get(scaleKey);
  if (scale.empty || !scale.notes) return null;
  const notes = scale.notes;
  const n = notes.length;
  if (n < 7) return null; // only 7-note scales produce clean diatonic chords

  const symbols = new Set<string>();
  const db = getChordDatabase();

  // Build lookup: chord chroma → database symbols
  const dbByChroma = new Map<string, string[]>();
  for (const entry of db) {
    if (entry.bassNote) continue; // handle slash chords separately
    const info = Chord.get(normalizeInput(entry.symbol));
    if (info && !info.empty && info.chroma) {
      if (!dbByChroma.has(info.chroma)) dbByChroma.set(info.chroma, []);
      dbByChroma.get(info.chroma)!.push(entry.symbol);
    }
  }

  // Collect chromas of detected diatonic chords
  const diatonicChromas = new Set<string>();

  for (let i = 0; i < n; i++) {
    // Triad: degrees i, i+2, i+4
    const triad = [notes[i], notes[(i + 2) % n], notes[(i + 4) % n]];
    for (const d of Chord.detect(triad)) {
      const info = Chord.get(d);
      if (info && !info.empty && info.chroma) diatonicChromas.add(info.chroma);
    }

    // 7th chord: degrees i, i+2, i+4, i+6
    const seventh = [notes[i], notes[(i + 2) % n], notes[(i + 4) % n], notes[(i + 6) % n]];
    for (const d of Chord.detect(seventh)) {
      const info = Chord.get(d);
      if (info && !info.empty && info.chroma) diatonicChromas.add(info.chroma);
    }
  }

  // Match detected chromas to database entries
  for (const chroma of diatonicChromas) {
    const entries = dbByChroma.get(chroma);
    if (entries) {
      for (const sym of entries) symbols.add(sym);
    }
  }

  // Also match slash chord entries whose base chord is diatonic
  const scaleChromaSet = new Set(notes.map(n => Note.chroma(n)));
  const baseSymbols = new Set(symbols);
  for (const entry of db) {
    if (entry.bassNote) {
      const parent = entry.symbol.split('/')[0];
      if (baseSymbols.has(parent)) {
        const bassChroma = Note.chroma(entry.bassNote);
        if (bassChroma !== undefined && scaleChromaSet.has(bassChroma)) {
          symbols.add(entry.symbol);
        }
      }
    }
  }

  return symbols;
}

function getScaleDiatonicSymbols(scaleKey: string): Set<string> | null {
  if (_scaleChordCache.has(scaleKey)) return _scaleChordCache.get(scaleKey)!;
  const result = computeScaleDiatonicSymbols(scaleKey);
  if (result) _scaleChordCache.set(scaleKey, result);
  return result;
}

/** Get all scale options for filter dropdowns */
export function getAllScaleOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (const root of SCALE_ROOTS) {
    for (const mode of SCALE_MODES) {
      options.push({ value: `${root} ${mode}`, label: `${root} ${mode}` });
    }
  }
  return options;
}

// ---- Scale degree grouping ----

export interface ScaleDegreeGroup {
  degree: number;
  romanLabel: string;
  functionName: string;
  rootNote: string;
  chordSymbol: string;
  symbols: Set<string>;
}

const DEGREE_FUNCTIONS = [
  'Tonic', 'Supertonic', 'Mediant', 'Subdominant', 'Dominant', 'Submediant', 'Leading',
];

const _scaleDegreeCache = new Map<string, ScaleDegreeGroup[]>();

function computeScaleChordsByDegree(scaleKey: string): ScaleDegreeGroup[] | null {
  const scale = Scale.get(scaleKey);
  if (scale.empty || !scale.notes) return null;
  const notes = scale.notes;
  const n = notes.length;
  if (n < 7) return null;

  const db = getChordDatabase();
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const groups: ScaleDegreeGroup[] = [];

  for (let i = 0; i < n; i++) {
    const root = notes[i];
    const rootChroma = Note.chroma(root) ?? 0;
    const thirdChroma = Note.chroma(notes[(i + 2) % n]) ?? 0;
    const fifthChroma = Note.chroma(notes[(i + 4) % n]) ?? 0;
    const thirdInterval = ((thirdChroma - rootChroma) + 12) % 12;
    const fifthInterval = ((fifthChroma - rootChroma) + 12) % 12;

    // Determine triad quality and suffix
    let triadQuality: 'major' | 'minor' | 'dim' | 'aug';
    let suffix: string;
    if (thirdInterval === 4 && fifthInterval === 8) { triadQuality = 'aug'; suffix = 'aug'; }
    else if (thirdInterval === 3 && fifthInterval === 6) { triadQuality = 'dim'; suffix = 'dim'; }
    else if (thirdInterval === 3) { triadQuality = 'minor'; suffix = 'm'; }
    else { triadQuality = 'major'; suffix = ''; }

    // Build the expected chord symbol
    const chordSymbol = formatChordName(root + (suffix || 'M'));

    // Find the root-position entry in db by matching root chroma + suffix
    const degreeSymbols = new Set<string>();
    for (const entry of db) {
      if (entry.bassNote) continue;
      const entryChroma = Note.chroma(entry.root);
      if (entryChroma === rootChroma && entry.typeSuffix === suffix) {
        degreeSymbols.add(entry.symbol);
      }
    }

    // Add slash chord inversions of matched base chords
    const baseSymbols = new Set(degreeSymbols);
    for (const entry of db) {
      if (entry.bassNote) {
        const parent = entry.symbol.split('/')[0];
        if (baseSymbols.has(parent)) {
          degreeSymbols.add(entry.symbol);
        }
      }
    }

    // Build roman numeral label
    let roman = ROMAN[i];
    if (triadQuality === 'minor') roman = roman.toLowerCase();
    else if (triadQuality === 'dim') roman = roman.toLowerCase() + '°';
    else if (triadQuality === 'aug') roman = roman + '+';

    groups.push({
      degree: i,
      romanLabel: roman,
      functionName: DEGREE_FUNCTIONS[i] || '',
      rootNote: root,
      chordSymbol,
      symbols: degreeSymbols,
    });
  }

  return groups;
}

export function getScaleChordsByDegree(scaleKey: string): ScaleDegreeGroup[] | null {
  if (_scaleDegreeCache.has(scaleKey)) return _scaleDegreeCache.get(scaleKey)!;
  const result = computeScaleChordsByDegree(scaleKey);
  if (result) _scaleDegreeCache.set(scaleKey, result);
  return result;
}
