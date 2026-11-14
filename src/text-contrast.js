/**
 * Text colours that stay readable on any fill.
 *
 * textOn() picks the dark or the light pair of TEXT_TONES, whichever has the
 * higher WCAG contrast with the fill, so a label drawn on an entity type's
 * colour stays readable whatever colour the type is given. Each pair holds
 * the main text colour and a muted one for secondary text.
 *
 * Pure: no DOM.
 */

export const TEXT_TONES = {
  dark: { text: '#1f2933', muted: '#4b5563' },
  light: { text: '#ffffff', muted: '#e5e7eb' },
};

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i;

const tones = new Map();

/**
 * Reads a '#rgb', '#rrggbb', '#rrggbbaa', 'rgb()' or 'rgba()' colour as its
 * red, green and blue channels, ignoring any alpha. Null for anything else.
 */
export function parseColor(value) {
  const color = String(value ?? '').trim();
  const hex = HEX_COLOR.exec(color);

  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1].slice(0, 6);

    return [0, 2, 4].map((start) => parseInt(digits.slice(start, start + 2), 16));
  }

  const rgb = RGB_COLOR.exec(color);

  if (!rgb) {
    return null;
  }

  const channels = rgb.slice(1, 4).map(Number);

  return channels.every((channel) => channel <= 255) ? channels : null;
}

function luminance(channels) {
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Returns the WCAG contrast ratio of 2 colours, from 1 to 21, or null when
 * either can't be read.
 */
export function contrastRatio(first, second) {
  const a = parseColor(first);
  const b = parseColor(second);

  if (!a || !b) {
    return null;
  }

  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns the '#rrggbb' colour of the top colour drawn at the opacity over the
 * bottom one, or the top colour unchanged when either can't be read.
 */
export function blendColors(top, bottom, opacity) {
  const a = parseColor(top);
  const b = parseColor(bottom);

  if (!a || !b) {
    return top;
  }

  return (
    '#' +
    a
      .map((channel, i) =>
        Math.round(channel * opacity + b[i] * (1 - opacity))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/**
 * Returns the TEXT_TONES key whose text colour contrasts most with the fill:
 * 'dark' or 'light'. A fill that can't be read takes 'dark'.
 */
export function textTone(fill) {
  const key = String(fill ?? '');

  if (!tones.has(key)) {
    const dark = contrastRatio(TEXT_TONES.dark.text, key);
    const light = contrastRatio(TEXT_TONES.light.text, key);

    tones.set(key, dark !== null && light > dark ? 'light' : 'dark');
  }

  return tones.get(key);
}

/**
 * Returns the { text, muted } pair of TEXT_TONES to draw on the fill.
 */
export function textOn(fill) {
  return TEXT_TONES[textTone(fill)];
}
