import { test, expect } from '@playwright/test';
import { copyLink, loadExample, openFrom, openSettings, selectTrackField } from './helpers.js';
import { MANUAL_PAGES } from '../../src/manual.js';
import { HELP_TARGETS } from '../../src/help.js';

const FIRST = MANUAL_PAGES[0];
const WITH_IMAGE = MANUAL_PAGES.find((page) => page.html.includes('<img '));
const WITH_LINK = MANUAL_PAGES.find((page) => page.html.includes('data-page='));

function shownPage(page) {
  return page.locator('#help .help__page');
}

function currentLink(page) {
  return page.locator('#help .help__link.is-current');
}

// Whether the element's top edge lies within the Help page's scrolled view.
function inPageView(page, selector) {
  return page.locator('#help .help__page').evaluate((scroller, target) => {
    const box = scroller.querySelector(target).getBoundingClientRect();
    const view = scroller.getBoundingClientRect();

    return box.top >= view.top - 1 && box.top < view.bottom;
  }, selector);
}

// The distance from the top of the scrolling box to the element's top edge.
function offsetIn(page, scroller, selector) {
  return page.locator(scroller).evaluate((box, target) => box.querySelector(target).getBoundingClientRect().top - box.getBoundingClientRect().top, selector);
}

test.describe('Help', { tag: '@runner-2' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('toggles the Help panel from the toolbar and with ?', async ({ page }) => {
    await loadExample(page);
    await expect(page.locator('#help')).toHaveCount(0);

    await page.click('#help-toggle');
    await expect(page.locator('#help')).toBeVisible();
    await expect(page.locator('#help .panel__title')).toHaveText('Help');
    await expect(page.locator('#help-toggle')).toHaveClass(/is-active/);
    await expect(shownPage(page)).toHaveAttribute('data-page', FIRST.id);
    await expect(page.locator('#help .help__title')).toHaveText(FIRST.title);
    await expect(currentLink(page)).toHaveText(FIRST.title);

    await page.keyboard.press('?');
    await expect(page.locator('#help')).toHaveCount(0);

    await page.keyboard.press('?');
    await expect(page.locator('#help')).toBeVisible();
  });

  test('lists every page of the manual in its section', async ({ page }) => {
    await loadExample(page);
    await page.click('#help-toggle');

    const titles = await page.locator('#help .help__link').allTextContents();

    expect(titles.map((title) => title.trim())).toEqual(MANUAL_PAGES.map((manualPage) => manualPage.title));
    await expect(page.locator('#help .help__section-title').first()).toHaveText(FIRST.section);
  });

  for (const [panel, open] of dataProviderPanels()) {
    test(`opens the page of the ${panel} panel from its ? button`, async ({ page }) => {
      await open(page);

      await page.locator('#' + panel + ' .panel__help').click();

      await expect(page.locator('#help')).toBeVisible();
      await expect(shownPage(page)).toHaveAttribute('data-page', HELP_TARGETS[panel].page);
    });
  }

  function dataProviderPanels() {
    const toggle = (panel) => async (page) => {
      await loadExample(page);

      if ((await page.locator('#' + panel).count()) === 0) {
        await page.click('#' + panel + '-toggle');
      }
    };

    return [
      ['entities', toggle('entities')],
      ['table', toggle('table')],
      ['legend', toggle('legend')],
      ['history', toggle('history')],
      ['checks', toggle('checks')],
      ['inspector', selectTrackField],
    ];
  }

  test('gives the Help panel no ? button of its own', async ({ page }) => {
    await loadExample(page);
    await page.click('#help-toggle');

    await expect(page.locator('#help .panel__help')).toHaveCount(0);
  });

  for (const [dialog, open] of dataProviderDialogs()) {
    test(`closes the ${dialog} dialog and opens its page from its ? button`, async ({ page }) => {
      await loadExample(page);
      await open(page);
      await expect(page.locator('#' + dialog)).toHaveAttribute('open', '');

      await page.locator('#' + dialog + ' .dialog__help').click();

      await expect(page.locator('#' + dialog)).not.toHaveAttribute('open', '');
      await expect(shownPage(page)).toHaveAttribute('data-page', HELP_TARGETS[dialog].page);
    });
  }

  function dataProviderDialogs() {
    return [
      ['settings', (page) => openSettings(page, 'types')],
      ['link-dialog', copyLink],
      ['ai-dialog', (page) => openFrom(page, 'ai')],
    ];
  }

  test('offers no ? button in a dialog opened from the landing screen', async ({ page }) => {
    await page.click('#landing-ai');
    await expect(page.locator('#ai-dialog')).toHaveAttribute('open', '');

    await expect(page.locator('#ai-dialog .dialog__help')).toBeHidden();
  });

  for (const anchor of ['link-protection', 'link-limits']) {
    test(`opens the ${anchor} section from the Copy link dialog`, async ({ page }) => {
      await loadExample(page);
      await copyLink(page);

      await page.click('#' + anchor);

      await expect(page.locator('#link-dialog')).not.toHaveAttribute('open', '');
      await expect(shownPage(page)).toHaveAttribute('data-page', 'sharing');
      await expect(page.locator('#help .help__sublink.is-current')).toHaveAttribute('data-help-anchor', anchor);
      expect(await inPageView(page, '#' + anchor)).toBe(true);
    });
  }

  test("lists the open page's sections and scrolls to the one picked", async ({ page }) => {
    const target = MANUAL_PAGES.find((manualPage) => manualPage.headings.length >= 3);
    const last = target.headings.at(-1);

    await loadExample(page);
    await page.click('#help-toggle');
    await page.click('#help [data-help-link="' + target.id + '"]');

    const sections = await page.locator('#help .help__sublink').allTextContents();
    expect(sections.map((text) => text.trim())).toEqual(target.headings.map((heading) => heading.text));

    await page.click('#help [data-help-anchor="' + last.id + '"]');
    await expect(page.locator('#help .help__sublink.is-current')).toHaveText(last.text);
    expect(await inPageView(page, '[id="' + last.id + '"]')).toBe(true);
  });

  test('scrolls a section to the top of the page', async ({ page }) => {
    const target = MANUAL_PAGES.find((manualPage) => manualPage.headings.length >= 3);
    const heading = target.headings[1];

    await loadExample(page);
    await page.click('#help-toggle');
    await page.click('#help [data-help-link="' + target.id + '"]');
    await page.click('#help [data-help-anchor="' + heading.id + '"]');

    const offset = await offsetIn(page, '#help .help__page', '[id="' + heading.id + '"]');

    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(20);
  });

  test('scrolls the docked contents to the page a ? button opens', async ({ page }) => {
    const checks = MANUAL_PAGES.find((manualPage) => manualPage.id === HELP_TARGETS.checks.page);
    const nav = page.locator('#help .help__nav');

    await loadExample(page);
    await page.click('#help-toggle');
    await page.click('#help .panel__pin');
    await expect(page.locator('#help .help')).toHaveClass(/is-narrow/);

    await expect(nav).toHaveJSProperty('scrollTop', 0);
    await page.click('#checks-toggle');
    await page.locator('#checks .panel__help').click();

    await expect(currentLink(page)).toHaveText(checks.title);

    const offset = await offsetIn(page, '#help .help__nav', '.help__link.is-current');

    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(await nav.evaluate((element) => element.clientHeight));
  });

  test('opens the page a link in the manual points to', async ({ page }) => {
    await loadExample(page);
    await page.click('#help-toggle');
    await page.click('#help [data-help-link="' + WITH_LINK.id + '"]');

    const link = page.locator('#help .help__content a[data-page]').first();
    const target = await link.getAttribute('data-page');
    await link.click();

    await expect(shownPage(page)).toHaveAttribute('data-page', target);
    expect(page.url()).not.toContain('docs/');
  });

  test('steps to the next and previous pages', async ({ page }) => {
    await loadExample(page);
    await page.click('#help-toggle');

    await expect(page.locator('#help .help__pager-link.is-previous')).toHaveCount(0);
    await page.click('#help .help__pager-link.is-next');
    await expect(shownPage(page)).toHaveAttribute('data-page', MANUAL_PAGES[1].id);

    await page.click('#help .help__pager-link.is-previous');
    await expect(shownPage(page)).toHaveAttribute('data-page', FIRST.id);
  });

  test('filters the contents by every word searched', async ({ page }) => {
    await loadExample(page);
    await page.click('#help-toggle');

    const word = 'checksum';
    const expected = MANUAL_PAGES.filter((manualPage) => (manualPage.title + ' ' + manualPage.summary + ' ' + manualPage.text).toLowerCase().includes(word));

    expect(expected.length).toBeGreaterThan(0);
    await page.locator('#help-search input').fill(word);

    const titles = await page.locator('#help .help__link').allTextContents();
    expect(titles.map((title) => title.trim())).toEqual(expected.map((manualPage) => manualPage.title));

    await page.locator('#help-search input').fill('qqqzzz');
    await expect(page.locator('#help .help__link')).toHaveCount(0);
    await expect(page.locator('#help .help__empty')).toHaveText('No page matches.');
  });

  test('shows the images of the manual', async ({ page }) => {
    await loadExample(page);
    await page.click('#help-toggle');
    await page.click('#help [data-help-link="' + WITH_IMAGE.id + '"]');

    const image = page.locator('#help .help__content img').first();
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  });

  test('docks like any panel and stacks its contents above the page in a rail', async ({ page }) => {
    await loadExample(page);
    await page.click('#help-toggle');
    await expect(page.locator('#help .help')).not.toHaveClass(/is-narrow/);

    await page.click('#help .panel__pin');

    await expect(page.locator('#help')).toHaveClass(/is-docked/);
    await expect(page.locator('#help .help')).toHaveClass(/is-narrow/);
  });

  test('opens About Nexus from the foot of the contents', async ({ page }) => {
    await loadExample(page);
    await page.click('#help-toggle');

    await page.click('#help-about');

    await expect(page.locator('#about-dialog')).toHaveAttribute('open', '');
  });
});
