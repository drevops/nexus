import { test, expect } from '@playwright/test';
import { loadExample, openBeforeAppStarts, openFrom, DARK_MARK, markFills } from './helpers.js';

// Text in each of the page's text colours: the brand, muted text, a machine
// name and an entity type caption.
const SELECTION_SAMPLES = ['.toolbar__brand','.statusbar__tips', '.caption:not(.caption--type)', '.caption--type'];

// The WCAG contrast ratio of 2 'rgb()' colours.
function contrastRatio(first, second) {
  const luminance = (colour) => {
    const [r, g, b] = colour
      .match(/\d+/g)
      .slice(0, 3)
      .map((channel) => {
        const value = Number(channel) / 255;

        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}

test.describe('Theme', { tag: '@runner-1' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('toggles a dark theme that persists across reloads', async ({ page }) => {
    await loadExample(page);

    expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(false);
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
    await page.click('#theme-toggle');
    expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(true);
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
    expect(await page.evaluate(() => window.localStorage.getItem('nexusTheme'))).toBe('dark');

    await page.reload();
    await loadExample(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(true);
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to light theme');
  });

  test('switches the theme from the landing screen and keeps it across reloads', async ({ page }) => {
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'));

    await expect(page.locator('#landing-theme')).toBeVisible();
    await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to dark theme');
    expect(await isDark()).toBe(false);

    await page.click('#landing-theme');
    expect(await isDark()).toBe(true);
    expect(await page.evaluate(() => window.localStorage.getItem('nexusTheme'))).toBe('dark');
    expect(await markFills(page, '.landing__mark')).toEqual(DARK_MARK);

    for (const toggle of ['#landing-theme', '#theme-toggle']) {
      await expect(page.locator(toggle)).toHaveAttribute('title', 'Switch to light theme');
    }

    await page.reload();
    await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to light theme');
    expect(await isDark()).toBe(true);

    await page.click('#landing-theme');
    expect(await isDark()).toBe(false);
    await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to dark theme');
  });

  for (const [name, stored, scheme, dark] of dataProviderEarlyThemes()) {
    test(`applies ${name} before the app starts`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript((value) => {
        if (value) {
          window.localStorage.setItem('nexusTheme', value);
        } else {
          window.localStorage.removeItem('nexusTheme');
        }
      }, stored);

      const start = await openBeforeAppStarts(page);

      await expect(page.locator('#template-list .template-list__loader')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(dark);

      start();

      await expect(page.locator('#landing-theme')).toHaveAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
      expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(dark);
    });
  }

  function dataProviderEarlyThemes() {
    return [
      ['a stored dark theme over a light system scheme', 'dark', 'light', true],
      ['a stored light theme over a dark system scheme', 'light', 'dark', false],
      ['a dark system scheme with no stored theme', null, 'dark', true],
      ['a light system scheme with no stored theme', null, 'light', false],
    ];
  }

  for (const [theme, dark] of dataProviderSelectionThemes()) {
    test(`draws selected text in 1 readable colour pair in the ${theme} theme`, async ({ page }) => {
      await loadExample(page);

      if (dark) {
        await page.click('#theme-toggle');
      }

      expect(await page.evaluate(() => document.documentElement.classList.contains('sl-theme-dark'))).toBe(dark);

      const pairs = await page.evaluate((selectors) => {
        return selectors.map((selector) => {
          const style = getComputedStyle(document.querySelector(selector), '::selection');

          return [style.backgroundColor, style.color];
        });
      }, SELECTION_SAMPLES);

      expect(new Set(pairs.map((pair) => pair.join('/'))).size).toBe(1);
      expect(contrastRatio(...pairs[0])).toBeGreaterThanOrEqual(4.5);
    });
  }

  function dataProviderSelectionThemes() {
    return [
      ['light', false],
      ['dark', true],
    ];
  }

  test('keeps the landing and toolbar theme toggles in step around an open diagram', async ({ page }) => {
    const fieldFill = () => page.evaluate(() => window.__nexus.cy.nodes('[group="field"][kind="single"]').first().style('background-color').replace(/\s/g, ''));

    await loadExample(page);
    await page.click('#theme-toggle');
    expect(await fieldFill()).toBe('rgb(43,48,57)');

    await openFrom(page, 'import');
    await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to light theme');

    await page.click('#landing-theme');
    expect(await fieldFill()).toBe('rgb(255,255,255)');

    await page.click('#landing-cancel');
    await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
  });
});
