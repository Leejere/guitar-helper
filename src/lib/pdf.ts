import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { Note, Interval } from 'tonal';

const INTERVAL_LABELS: Record<string, string> = {
  '1P': 'R', '2m': '♭2', '2M': '2', '2A': '♯2',
  '3m': '♭3', '3M': '3', '4P': '4', '4A': '♯4',
  '5d': '♭5', '5P': '5', '5A': '♯5', '6m': '♭6',
  '6M': '6', '7m': '♭7', '7M': '7',
};

// Light-background color palette for PDF
const C = {
  bg: '#ffffff',
  nut: '#3a2a1a',
  fretWire: '#bbb',
  string: '#7a6245',
  marker: '#d4c4b0',
  fretNum: '#887766',
  stringLabel: '#443322',
  dotBg: '#2a7aaa',
  dotBgAccidental: '#8aafbf',
  dotText: '#fff',
  dotTextAccidental: '#f0f0f0',
  rootBg: '#cc4422',
  openStroke: '#1a5577',
  intervals: {
    'R': '#cc4422',
    '♭2': '#8855aa', '2': '#6a6abb',
    '♭3': '#4488cc', '3': '#2277aa',
    '4': '#229988', '♯4': '#44aa55',
    '♭5': '#44aa55', '5': '#2d8040',
    '♯5': '#7a9e2a', '♭6': '#7a9e2a', '6': '#a0a020',
    '♭7': '#cc8822', '7': '#cc6633',
  } as Record<string, string>,
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function displayAccidentalPdf(s: string): string {
  return s
    .replace(/([A-Ga-g])#/g, '$1♯')
    .replace(/([A-Ga-g])b/g, '$1♭');
}

function buildFretboardSvg(
  tuning: string[],
  fretCount: number,
  mode: 'notes' | 'intervals',
  rootNote: string,
  w: number,
  h: number,
): string {
  const nStrings = tuning.length;
  const mL = 36, mR = 12, mT = 40, mB = 40;
  const bW = w - mL - mR;
  const rawBH = h - mT - mB;
  const maxStringSpacing = 60;            // cap to prevent overly wide spacing
  const sS = Math.min(rawBH / (nStrings - 1), maxStringSpacing);
  const bH = sS * (nStrings - 1);        // actual board height after capping
  const yOff = mT + (rawBH - bH) / 2;   // center board vertically
  const fS = bW / fretCount;              // fret spacing — no trailing empty space
  const dr = Math.min(sS, fS) * 0.33;    // dot radius

  const fx = (f: number) => mL + f * fS;
  const sy = (s: number) => yOff + (nStrings - 1 - s) * sS;
  const dx = (f: number) => f === 0 ? dr + 4 : fx(f) - fS / 2;

  const markers = [3, 5, 7, 9, 12, 15];
  const doubles = [12];
  const o: string[] = [];

  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  o.push(`<rect width="${w}" height="${h}" fill="${C.bg}" rx="5"/>`);

  // fret inlay markers
  for (let f = 1; f <= fretCount; f++) {
    const cx = fx(f) - fS / 2;
    if (markers.includes(f) && !doubles.includes(f)) {
      o.push(`<circle cx="${cx}" cy="${yOff + bH / 2}" r="4" fill="${C.marker}"/>`);
    }
    if (doubles.includes(f)) {
      o.push(`<circle cx="${cx}" cy="${yOff + bH / 2 - sS * 1.1}" r="4" fill="${C.marker}"/>`);
      o.push(`<circle cx="${cx}" cy="${yOff + bH / 2 + sS * 1.1}" r="4" fill="${C.marker}"/>`);
    }
  }

  // nut
  o.push(`<rect x="${mL - 3}" y="${yOff - 5}" width="5" height="${bH + 10}" fill="${C.nut}" rx="1.5"/>`);

  // fret wires
  for (let f = 1; f <= fretCount; f++) {
    const x = fx(f);
    o.push(`<line x1="${x}" y1="${yOff - 3}" x2="${x}" y2="${yOff + bH + 3}" stroke="${C.fretWire}" stroke-width="1.2"/>`);
  }

  // strings
  for (let s = 0; s < nStrings; s++) {
    const y = sy(s);
    const sw = 0.8 + (nStrings - 1 - s) * 0.42;
    o.push(`<line x1="${mL}" y1="${y}" x2="${w - mR}" y2="${y}" stroke="${C.string}" stroke-width="${sw.toFixed(2)}"/>`);
  }

  // fret numbers — placed well above the top string
  for (let f = 1; f <= fretCount; f++) {
    o.push(`<text x="${fx(f) - fS / 2}" y="${yOff - dr - 8}" text-anchor="middle" font-size="9" fill="${C.fretNum}" font-family="sans-serif">${f}</text>`);
  }

  const NATURAL_NOTES = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  const NATURAL_INTERVALS = new Set(['R', '2', '3', '4', '5', '6', '7']);

  // note dots
  for (let s = 0; s < nStrings; s++) {
    for (let f = 0; f <= fretCount; f++) {
      const note = Note.transpose(tuning[s], Interval.fromSemitones(f));
      const pc = Note.pitchClass(note);
      let label: string;
      let fill: string;
      let natural: boolean;
      const isOpen = f === 0;

      if (mode === 'intervals') {
        const iv = Interval.distance(rootNote, pc);
        label = INTERVAL_LABELS[iv] ?? iv;
        natural = NATURAL_INTERVALS.has(label);
        if (label === 'R') {
          fill = C.rootBg;
        } else {
          fill = natural ? (C.intervals[label] ?? C.dotBg) : (C.intervals[label] ?? C.dotBgAccidental);
        }
      } else {
        label = displayAccidentalPdf(pc);
        natural = NATURAL_NOTES.has(pc);
        fill = natural ? C.dotBg : C.dotBgAccidental;
      }

      const cx = dx(f), cy = sy(s);
      const r = natural ? dr : dr * 0.82;
      const opacity = natural ? 1 : 0.55;

      if (isOpen) {
        // Open string: outlined ring
        o.push(`<circle cx="${cx}" cy="${cy}" r="${dr}" fill="${fill}" stroke="${C.openStroke}" stroke-width="2"/>`);
      } else {
        o.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`);
      }

      const textFill = natural ? C.dotText : C.dotTextAccidental;
      const fs = label.length > 2 ? 7 : label.length > 1 ? (natural ? 8.5 : 7.5) : (natural ? 9.5 : 8);
      const fw = natural ? '700' : '600';
      o.push(`<text x="${cx}" y="${cy + 3.2}" text-anchor="middle" font-size="${fs}" fill="${textFill}" font-family="sans-serif" font-weight="${fw}">${escapeXml(label)}</text>`);
    }
  }

  o.push('</svg>');
  return o.join('\n');
}

export interface ExportOptions {
  tuning: string[];
  fretCount: number;
  mode: 'notes' | 'intervals';
  rootNote: string;
}

export async function exportFretboardPdf(
  opts: ExportOptions,
  filename: string = 'fretboard.pdf',
  title?: string,
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 32;

  // title
  let y = m;
  if (title) {
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 40, 30);
    doc.text(title, pw / 2, y, { align: 'center' });
    y += 22;
  }

  // SVG fills remaining space
  const svgW = pw - m * 2;
  const svgH = ph - y - m - 10;

  const svgStr = buildFretboardSvg(opts.tuning, opts.fretCount, opts.mode, opts.rootNote, svgW, svgH);
  const svgEl = new DOMParser().parseFromString(svgStr, 'image/svg+xml').documentElement;

  await doc.svg(svgEl, { x: m, y, width: svgW, height: svgH });

  // footer
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180);
  doc.text('Guitar Helper', pw / 2, ph - m / 2 + 4, { align: 'center' });

  doc.save(filename);
}
