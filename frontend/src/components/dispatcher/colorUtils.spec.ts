import { describe, expect, it } from 'vitest';
import { hexToHsv, hexToRgb, hsvToHex, normalizeHex, rgbToHex } from './colorUtils';

describe('colorUtils', () => {
  it('нормализует hex', () => {
    expect(normalizeHex('D4EDBC')).toBe('#d4edbc');
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('zzz')).toBeNull();
  });

  it('hex ⇄ rgb', () => {
    expect(hexToRgb('#d4edbc')).toEqual({ r: 212, g: 237, b: 188 });
    expect(rgbToHex({ r: 212, g: 237, b: 188 })).toBe('#d4edbc');
  });

  it('hex → hsv → hex без потерь', () => {
    ['#d4edbc', '#b10202', '#0a53a8', '#ffffff', '#000000', '#5a3286'].forEach((hex) => {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    });
  });
});
