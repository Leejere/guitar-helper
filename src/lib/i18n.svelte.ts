import { en } from './translations/en';
import { cn } from './translations/cn';

export type Locale = 'en' | 'cn';

const strings: Record<Locale, Record<string, string>> = { en, cn };

class I18n {
  locale: Locale = $state('en');

  constructor() {
    if (typeof window !== 'undefined') {
      this.locale = window.location.pathname.includes('/cn/') ? 'cn' : 'en';
      document.documentElement.lang = this.locale === 'cn' ? 'zh-CN' : 'en';
      document.title = strings[this.locale]['app.title'] ?? 'Guitar Helper';
    }
  }

  t(key: string, ...args: (string | number)[]): string {
    let s = strings[this.locale][key] ?? strings.en[key] ?? key;
    for (let i = 0; i < args.length; i++) {
      s = s.replace(`{${i}}`, String(args[i]));
    }
    return s;
  }

  setLocale(loc: Locale) {
    if (loc === this.locale) return;
    this.locale = loc;
    const base = import.meta.env.BASE_URL;
    const newPath = loc === 'cn' ? `${base}cn/` : base;
    window.history.replaceState(null, '', newPath + window.location.hash);
    document.documentElement.lang = loc === 'cn' ? 'zh-CN' : 'en';
    document.title = strings[loc]['app.title'] ?? 'Guitar Helper';
  }
}

export const i18n = new I18n();

/** Translate a key, with optional {0}, {1}… interpolation */
export function t(key: string, ...args: (string | number)[]): string {
  return i18n.t(key, ...args);
}

/** Translate a count string — uses "singular | plural" format */
export function tc(key: string, count: number): string {
  const raw = strings[i18n.locale][key] ?? strings.en[key] ?? key;
  const parts = raw.split(' | ');
  const tpl = count === 1 && parts.length > 1 ? parts[0] : (parts[1] ?? parts[0]);
  return tpl.replace('{0}', String(count));
}

/** Translate a scale mode name (e.g. 'harmonic minor' → key 'mode.harmonicMinor') */
export function tMode(mode: string): string {
  const k = 'mode.' + mode.replace(/ (.)/g, (_: string, c: string) => c.toUpperCase());
  return i18n.t(k);
}

/** Translate a chord category name */
export function tCategory(cat: string): string {
  return i18n.t(`cat.${cat}`);
}

/** Translate a chord relation label */
export function tRelation(label: string): string {
  return i18n.t(`rel.${label}`);
}

/** Translate a tuning name */
export function tTuning(name: string): string {
  return i18n.t(`tuning.${name}`);
}

/** Translate a CAGED shape name prefix (e.g. "Dim" → "减") */
export function tShapeName(name: string): string {
  const key = `shapes.name.${name}`;
  const result = i18n.t(key);
  return result === key ? name : result;
}

/** Translate a CAGED shape label (e.g. "Em7 shape" or "E shape var." or "Dim shape") */
export function tShapeLabel(label: string): string {
  const varMatch = label.match(/^(.+) shape var\.$/);
  if (varMatch) return i18n.t('finder.shapeVar', tShapeName(varMatch[1]));
  const baseMatch = label.match(/^(.+) shape$/);
  if (baseMatch) return i18n.t('shapes.shapeLabel', tShapeName(baseMatch[1]));
  return label;
}

/** Translate a position group (e.g. "Open position" or "Fret 3") */
export function tPosition(group: string): string {
  if (group === 'Open position') return i18n.t('common.openPosition');
  const m = group.match(/^Fret (\d+)$/);
  if (m) return i18n.t('common.fretN', m[1]);
  return group;
}

/** Translate a chord type name (e.g. "major", "diminished seventh") */
export function tTypeName(name: string): string {
  const key = `type.${name}`;
  const result = i18n.t(key);
  return result === key ? name : result;
}

/** Translate a scale degree function name (e.g. "Tonic", "Dominant") */
export function tFunctionName(name: string): string {
  const key = `func.${name}`;
  const result = i18n.t(key);
  return result === key ? name : result;
}
