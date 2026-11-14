import { test, expect } from '@playwright/test';
import { entityCount, loadExample, boxesOverlap, openBeforeAppStarts, openFrom } from './helpers.js';

test.describe('Landing', { tag: '@runner-1' }, () => {
  function boxesOf(page, selectors) {
    return Promise.all(selectors.map((selector) => page.locator(selector).boundingBox()));
  }

  function expectInTopRightCorner(outer, box) {
    expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width);
    expect(box.x).toBeGreaterThan(outer.x + outer.width - 100);
    expect(box.y).toBeGreaterThanOrEqual(outer.y);
    expect(box.y).toBeLessThan(outer.y + 50);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('draws the landing before the diagram libraries load and keeps it inert until the app starts', async ({ page }) => {
    const start = await openBeforeAppStarts(page);
    const landing = page.locator('#landing');

    await expect(landing).toHaveAttribute('data-drawn', '');
    expect(await page.evaluate(() => Boolean(customElements.get('sl-button')))).toBe(true);
    await expect(page.locator('#folder-btn')).toBeVisible();
    await expect(page.locator('.landing__mark svg.icon--nexus')).toBeVisible();
    await expect(landing).toHaveAttribute('aria-busy', 'true');
    expect(await landing.evaluate((element) => element.inert)).toBe(true);
    await expect(page.locator('.landing__corner')).toBeHidden();
    expect(await page.evaluate(() => typeof window.cytoscape)).toBe('undefined');

    start();

    await expect(landing).not.toHaveAttribute('aria-busy');
    expect(await landing.evaluate((element) => element.inert)).toBe(false);
    await expect(page.locator('#landing-theme')).toBeVisible();
  });

  test('shows the card only once it is drawn and never moves it while the app starts', async ({ page }) => {
    const parts = [
      '.landing__card',
      '.landing__header',
      '#dropzone',
      '#folder-btn',
      '#landing-open',
      '#new-btn',
      '#landing-ai',
      '#template-list',
      '.landing__more',
    ];
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });

    await page.route('**/src/boot.js', async (route) => {
      await held;
      await route.continue();
    });

    const start = await openBeforeAppStarts(page);
    const card = page.locator('.landing__card');

    await page.locator('.landing__more').waitFor({ state: 'attached' });
    await expect(card).toBeHidden();
    await expect(page.locator('.template-row')).toHaveCount(0);

    release();

    await expect(card).toBeVisible();
    await expect(page.locator('.template-row')).toHaveCount(5);
    const drawn = await boxesOf(page, parts);

    start();

    await expect(page.locator('#landing')).not.toHaveAttribute('aria-busy');
    expect(await boxesOf(page, parts)).toEqual(drawn);
  });

  test('draws the card as a plain element, so its frame needs no component to load', async ({ page }) => {
    const card = page.locator('.landing__card');

    expect(await card.evaluate((element) => element.localName)).toBe('div');
    expect(await card.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).toBe('16px');
  });

  test('reopens the import screen and cancels back to the diagram', async ({ page }) => {
    await loadExample(page);

    await openFrom(page, 'import');
    await expect(page.locator('#landing')).toBeVisible();
    await expect(page.locator('#landing-cancel')).toBeVisible();

    await page.click('#landing-cancel');
    await expect(page.locator('#landing')).toBeHidden();
    expect(await entityCount(page)).toBeGreaterThan(0);
  });

  test('scrolls the landing screen to every part of the card in a short window', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 460 });
    const card = page.locator('.landing__card');
    expect((await card.boundingBox()).y).toBeGreaterThanOrEqual(0);

    await page.locator('#landing').evaluate((landing) => {
      landing.scrollTop = landing.scrollHeight;
    });
    const box = await card.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(460);
  });

  test('lays the landing out with your configuration beside the templates', async ({ page }) => {
    const [dropzone, list, open, scratch] = await boxesOf(page, ['#dropzone', '#template-list', '#landing-open', '#new-btn']);

    expect(list.x).toBeGreaterThan(dropzone.x + dropzone.width);
    expect(list.y).toBeCloseTo(dropzone.y, 0);
    expect(scratch.x).toBeGreaterThan(open.x + open.width);
    expect(scratch.y).toBe(open.y);
    expect(scratch.width).toBe(open.width);
  });

  test('stacks the templates below your configuration in a narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const [dropzone, list, open, scratch] = await boxesOf(page, ['#dropzone', '#template-list', '#landing-open', '#new-btn']);

    expect(list.x).toBe(dropzone.x);
    expect(list.width).toBe(dropzone.width);
    expect(list.y).toBeGreaterThan(dropzone.y + dropzone.height);
    expect(scratch.x).toBe(open.x);
    expect(scratch.width).toBe(open.width);
  });

  test('keeps the card within 80% of a short window and scrolls the template list past it', async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 820 });
    await addTemplateRows(page, 5);
    const list = page.locator('#template-list');

    expect((await page.locator('.landing__card').boundingBox()).height).toBeLessThanOrEqual(820 * 0.8);
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

    await page.locator('.template-row').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.template-row').last()).toBeInViewport();
  });

  test('shows every template in a tall window and stretches the dropzone to the height of the list', async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 1200 });
    await addTemplateRows(page, 5);
    const list = page.locator('#template-list');

    expect(await list.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);

    const [ai, more] = await boxesOf(page, ['#landing-ai', '.landing__more']);
    expect(ai.y + ai.height).toBeCloseTo(more.y + more.height, 0);
  });

  test('puts the name and tagline below the Nexus mark in a narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const [mark, name, tag] = await boxesOf(page, ['.landing__mark svg.icon--nexus', '.landing__logo', '.landing__tag']);

    expect(name.y).toBeGreaterThanOrEqual(mark.y + mark.height);
    expect(name.x).toBeCloseTo(mark.x, 0);
    expect(tag.x).toBeCloseTo(mark.x, 0);
  });

  test('shows every template without a cap in a narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await addTemplateRows(page, 5);

    expect(await page.locator('#template-list').evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  });

  // Copies the template rows the app drew, so the list holds more templates
  // than ship.
  async function addTemplateRows(page, count) {
    await expect(page.locator('#landing')).not.toHaveAttribute('aria-busy');
    await page.locator('#template-list').evaluate((list, total) => {
      const rows = [...list.querySelectorAll('.template-row')];

      for (let i = 0; i < total; i++) {
        list.append(rows[i % rows.length].cloneNode(true));
      }
    }, count);
  }

  test('offers a close button in the corner of the card only while a diagram is open', async ({ page }) => {
    await expect(page.locator('#landing-cancel')).toBeHidden();

    await loadExample(page);
    await openFrom(page, 'import');
    await expect(page.locator('#landing-cancel')).toBeVisible();

    const [card, close] = await boxesOf(page, ['.landing__card', '#landing-cancel']);

    expectInTopRightCorner(card, close);
  });

  test('puts the theme toggle in the corner of the card, beside the close button once a diagram is open', async ({ page }) => {
    const [card, toggle] = await boxesOf(page, ['.landing__card', '#landing-theme']);

    expectInTopRightCorner(card, toggle);

    await loadExample(page);
    await openFrom(page, 'import');
    await expect(page.locator('#landing-cancel')).toBeVisible();

    const [cardWithClose, beside, close] = await boxesOf(page, ['.landing__card', '#landing-theme', '#landing-cancel']);

    expectInTopRightCorner(cardWithClose, close);
    expect(beside.x + beside.width).toBeLessThanOrEqual(close.x);
    expect(close.x - (beside.x + beside.width)).toBeLessThan(16);
    expect(beside.y).toBe(close.y);
  });

  for (const width of dataProviderLandingWidths()) {
    test(`keeps the corner buttons clear of the Nexus mark in a ${width}px window`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await loadExample(page);
      await openFrom(page, 'import');
      await expect(page.locator('#landing-cancel')).toBeVisible();

      const [mark, toggle, close] = await boxesOf(page, ['.landing__mark svg.icon--nexus', '#landing-theme', '#landing-cancel']);

      expect(boxesOverlap(mark, toggle)).toBe(false);
      expect(boxesOverlap(mark, close)).toBe(false);
    });
  }

  function dataProviderLandingWidths() {
    return [375, 320, 280];
  }

  test('keeps keyboard focus on the landing screen while it is open', async ({ page }) => {
    const focusedId = () => page.evaluate(() => document.activeElement.id);

    // A Shoelace control takes focus only once it renders its inner control.
    await page.waitForFunction(() =>
      ['diagram-title', 'landing-theme', 'folder-btn'].every((id) => document.getElementById(id).shadowRoot?.querySelector('input, button')),
    );
    await page.keyboard.press('Tab');
    expect(await focusedId()).toBe('landing-theme');
    await page.keyboard.press('Tab');
    expect(await focusedId()).toBe('folder-btn');

    await loadExample(page);
    await openFrom(page, 'import');
    await page.keyboard.press('Tab');
    expect(await focusedId()).toBe('landing-theme');
    await page.keyboard.press('Tab');
    expect(await focusedId()).toBe('landing-cancel');

    await page.click('#landing-cancel');
    expect(await page.locator('.toolbar').evaluate((toolbar) => toolbar.inert)).toBe(false);
  });

  test('closes the landing screen with Escape only while a diagram is open', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.locator('#landing')).toBeVisible();

    await loadExample(page);
    await openFrom(page, 'import');
    await expect(page.locator('#landing')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#landing')).toBeHidden();
    expect(await entityCount(page)).toBe(16);
  });

  test('heads the landing screen with the app name above its 2 sections', async ({ page }) => {
    const headings = await page
      .locator('#landing')
      .locator('h1, h2')
      .evaluateAll((elements) => elements.map((element) => element.tagName + ' ' + element.textContent.trim()));

    expect(headings).toEqual(['H1 Nexus', 'H2 Your configuration', 'H2 Start from a template']);
  });

  test('links the landing note to the annotation overlay documentation in a new tab', async ({ page }) => {
    const link = page.locator('#dropzone .landing__note').getByRole('link', { name: 'annotations.yml' });

    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://github.com/drevops/nexus#annotation-overlay');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    expect(await link.evaluate((element) => getComputedStyle(element).color)).toBe(
      await page.locator('.landing__more a').evaluate((element) => getComputedStyle(element).color),
    );
  });
});
