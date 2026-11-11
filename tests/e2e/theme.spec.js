import { test, expect } from '@playwright/test';
import { loadExample, DARK_MARK, markFills } from './helpers.js';

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
  expect(await markFills(page, '.landing__logo')).toEqual(DARK_MARK);

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

test('keeps the landing and toolbar theme toggles in step around an open diagram', async ({ page }) => {
  const fieldFill = () => page.evaluate(() => window.__nexus.cy.nodes('[group="field"][kind="single"]').first().style('background-color').replace(/\s/g, ''));

  await loadExample(page);
  await page.click('#theme-toggle');
  expect(await fieldFill()).toBe('rgb(43,48,57)');

  await page.click('#doc-import');
  await expect(page.locator('#landing-theme')).toHaveAttribute('title', 'Switch to light theme');

  await page.click('#landing-theme');
  expect(await fieldFill()).toBe('rgb(255,255,255)');

  await page.click('#landing-cancel');
  await expect(page.locator('#theme-toggle')).toHaveAttribute('title', 'Switch to dark theme');
});
