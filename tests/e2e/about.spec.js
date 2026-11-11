import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadExample } from './helpers.js';

test.describe('About', { tag: '@runner-1' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('opens an about dialog explaining browser-only storage and the licence', async ({ page }) => {
    const { license } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8'));

    await loadExample(page);
    await expect(page.locator('#about-dialog')).not.toBeVisible();

    await page.click('#about-toggle');
    await expect(page.locator('#about-dialog')).toBeVisible();
    await expect(page.locator('#about-dialog')).toContainText('content-model visual builder');
    await expect(page.locator('#about-dialog')).toContainText('Press F1 to label every button with its keyboard shortcut');
    await expect(page.locator('#about-dialog')).toContainText('there is no backend');
    await expect(page.locator('#about-dialog')).toContainText('without warranty');
    await expect(page.locator('#about-repo')).toHaveAttribute('href', 'https://github.com/drevops/nexus');
    await expect(page.locator('#about-license')).toHaveAttribute('href', 'https://github.com/drevops/nexus/blob/main/LICENSE');
    await expect(page.locator('#about-license')).toHaveText('GNU General Public License, version 2 or later');
    await expect(page.locator('#about-dialog')).toContainText('(' + license + ')');

    await page.click('#about-close');
    await expect(page.locator('#about-dialog')).not.toBeVisible();
  });

  test('shows the app version on the landing screen and in the about dialog', async ({ page }) => {
    await expect(page.locator('#landing-version')).toHaveText('dev');

    await loadExample(page);
    await page.click('#about-toggle');
    await expect(page.locator('#about-version')).toHaveText('dev');
  });
});
