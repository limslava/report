/** Преобразования цвета для палитры реестра: HEX ⇄ RGB ⇄ HSV. */

export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeHex(raw: string): string | null {
  const text = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) return `#${text.split('').map((char) => char + char).join('')}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`.toLowerCase();
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? '#000000';
  const value = parseInt(normalized.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? delta / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

export const hexToHsv = (hex: string): Hsv => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv: Hsv): string => rgbToHex(hsvToRgb(hsv));

/** Готовые цвета чипов (как в выпадающих списках google-таблиц): светлый ряд и тёмный. */
export const PRESET_COLORS: Array<{ background: string; text: string }> = [
  { background: '#e8eaed', text: '#3c4043' },
  { background: '#ffcfc9', text: '#b10202' },
  { background: '#ffc8aa', text: '#753800' },
  { background: '#ffe5a0', text: '#473821' },
  { background: '#d4edbc', text: '#11734b' },
  { background: '#bfe1f6', text: '#0a53a8' },
  { background: '#c6dbe1', text: '#215a6c' },
  { background: '#e6cff2', text: '#5a3286' },
  { background: '#3d3d3d', text: '#ffffff' },
  { background: '#b10202', text: '#ffcfc9' },
  { background: '#753800', text: '#ffc8aa' },
  { background: '#473821', text: '#ffe5a0' },
  { background: '#11734b', text: '#d4edbc' },
  { background: '#0a53a8', text: '#bfe1f6' },
  { background: '#215a6c', text: '#c6dbe1' },
  { background: '#5a3286', text: '#e6cff2' },
];
