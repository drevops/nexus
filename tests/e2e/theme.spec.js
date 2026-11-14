import { test, expect } from '@playwright/test';
import { loadExample, openBeforeAppStarts, openFrom, DARK_MARK, markFills } from './helpers.js';

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

  for (const [kind, expected] of dataProviderFocusedFieldText()) {
    test(`draws a focused ${kind} field's label in dark text in the dark theme`, async ({ page }) => {
      await loadExample(page);
      await page.click('#theme-toggle');

      const colors = await page.evaluate((fieldKind) => {
        const field = window.__nexus.cy.nodes('[group="field"][kind="' + fieldKind + '"]').first();

        field.emit('tap');

        return [field.hasClass('trace-source'), field.style('background-color'), field.style('color')].map((value) => String(value).replace(/\s/g, ''));
      }, kind);

      expect(colors).toEqual(['true', 'rgb(195,240,232)', expected]);
    });
  }

  function dataProviderFocusedFieldText() {
    return [
      ['single', 'rgb(31,41,51)'],
      ['multi', 'rgb(31,41,51)'],
      ['system', 'rgb(31,41,51)'],
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
