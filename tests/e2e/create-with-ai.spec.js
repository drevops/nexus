import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadFrom, entityCount, loadExample, openFrom, pasteDiagram, slFill, waitForGraph } from './helpers.js';

test.describe('Create with AI', { tag: '@runner-2' }, () => {
  const SKILL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'create-nexus-diagram', 'SKILL.md'), 'utf8');

  // The skill's example document, as JSON text.
  const EXAMPLE = SKILL.match(/```json\n(\{[\s\S]*?\n\})\n```/)[1];

  // The URL the page under test serves the skill from.
  function skillUrl(baseURL) {
    return new URL('/skills/create-nexus-diagram/SKILL.md', baseURL).href;
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  for (const [name, open] of dataProviderOpenDialog()) {
    test(`opens the Create with AI dialog ${name}`, async ({ page }) => {
      await open(page);

      await expect(page.locator('#ai-dialog')).toHaveAttribute('open', '');
      await expect(page.locator('#ai-prompt')).toBeVisible();
    });
  }

  function dataProviderOpenDialog() {
    const fromOpenMenu = async (page) => {
      await loadExample(page);
      await openFrom(page, 'ai');
    };
    const byKey = async (page) => {
      await page.waitForFunction(() => customElements.get('sl-dialog'));
      await page.keyboard.press('Alt+A');
    };

    return [
      ['from the landing screen', (page) => page.click('#landing-ai')],
      ['from the Open menu', fromOpenMenu],
      ['with Alt+A on the landing screen', byKey],
    ];
  }

  for (const width of dataProviderActionWidths()) {
    test(`puts Create with AI below the other landing actions, across their width, in a ${width}px window`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const [open, scratch, ai] = await Promise.all(['#landing-open', '#new-btn', '#landing-ai'].map((selector) => page.locator(selector).boundingBox()));

      expect(ai.x).toBe(open.x);
      expect(ai.y).toBeGreaterThan(open.y + open.height);
      expect(ai.x + ai.width).toBeCloseTo(scratch.x + scratch.width, 0);
    });
  }

  function dataProviderActionWidths() {
    return [1280, 700];
  }

  test('offers a prompt and an install command that name the skill this site serves', async ({ page, baseURL }) => {
    await page.click('#landing-ai');

    await expect(page.locator('#ai-prompt')).toContainText('Read the Nexus skill at ' + skillUrl(baseURL) + ' ');
    await expect(page.locator('#ai-prompt')).toContainText('single JSON code block');

    await page.click('#ai-tab-install');
    await expect(page.locator('#ai-install')).toHaveText('curl -sSL --create-dirs -o .claude/skills/create-nexus-diagram/SKILL.md ' + skillUrl(baseURL));

    const response = await page.request.get(skillUrl(baseURL));
    expect(response.ok()).toBe(true);
    expect(await response.text()).toBe(SKILL);
  });

  test('shows the whole skill and downloads it as SKILL.md', async ({ page }) => {
    await page.click('#landing-ai');
    await page.click('#ai-tab-skill');

    await expect(page.locator('#ai-skill')).toHaveText(SKILL, { useInnerText: false });
    await expect(page.locator('#ai-copy-skill')).not.toHaveAttribute('disabled');

    const download = await downloadFrom(page, '#ai-download-skill');

    expect(download.suggestedFilename()).toBe('SKILL.md');
    expect(readFileSync(await download.path(), 'utf8')).toBe(SKILL);
  });

  test('says the skill could not be loaded and tries again on the next open', async ({ page, baseURL }) => {
    await page.route('**/SKILL.md', (route) => route.abort());
    await page.click('#landing-ai');
    await page.click('#ai-tab-skill');

    await expect(page.locator('#ai-skill')).toContainText('The skill could not be loaded. Download it, or open ' + skillUrl(baseURL));
    await expect(page.locator('#ai-copy-skill')).toHaveAttribute('disabled', '');

    await page.unroute('**/SKILL.md');
    await page.click('#ai-close');
    await expect(page.locator('#ai-dialog')).not.toHaveAttribute('open');
    await page.click('#landing-ai');

    await expect(page.locator('#ai-skill')).toHaveText(SKILL, { useInnerText: false });
  });

  for (const [name, button, block, tab] of dataProviderCopyButtons()) {
    test(`copies ${name} to the clipboard`, async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.click('#landing-ai');

      if (tab) {
        await page.click(tab);
      }

      await expect(page.locator(block)).not.toHaveText(/^Loading/);
      await page.click(button);

      await expect(page.locator(button + ' .ai__copy-label')).toHaveText('Copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator(block).textContent());
    });
  }

  function dataProviderCopyButtons() {
    return [
      ['the prompt', '#ai-copy-prompt', '#ai-prompt', null],
      ['the skill', '#ai-copy-skill', '#ai-skill', '#ai-tab-skill'],
      ['the install command', '#ai-copy-install', '#ai-install', '#ai-tab-install'],
    ];
  }

  test('selects the text to copy when the clipboard is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('NotAllowedError'));
    });
    await page.goto('/index.html');
    await page.click('#landing-ai');
    await page.click('#ai-copy-prompt');

    await expect(page.locator('#ai-copy-prompt .ai__copy-label')).toHaveText('Selected to copy');
    expect(await page.evaluate(() => window.getSelection().toString())).toBe(await page.locator('#ai-prompt').textContent());
    await expect(page.locator('#ai-copy-prompt .ai__copy-label')).toHaveText('Copy prompt', { timeout: 5000 });
  });

  for (const [name, text] of dataProviderPastedReplies()) {
    test(`opens ${name} pasted into the dialog`, async ({ page }) => {
      await pasteDiagram(page, text);
      await waitForGraph(page);

      await expect(page.locator('#ai-dialog')).not.toHaveAttribute('open');
      await expect(page.locator('#landing')).toBeHidden();
      await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Events site');
      expect(await entityCount(page)).toBe(4);
    });
  }

  function dataProviderPastedReplies() {
    return [
      ['a document', EXAMPLE],
      ['a whole reply with the document in a code block', 'Here is the diagram.\n\n```json\n' + EXAMPLE + '\n```\n\nI assumed the venues are a vocabulary.'],
    ];
  }

  test('replaces the open diagram with one pasted from the Open menu', async ({ page }) => {
    await loadExample(page);
    await openFrom(page, 'ai');
    await slFill(page, '#ai-paste', EXAMPLE);
    await page.click('#ai-open');

    await expect(page.locator('#diagram-title')).toHaveJSProperty('value', 'Events site');
    expect(await entityCount(page)).toBe(4);
  });

  for (const [name, text, message] of dataProviderUnopenablePastes()) {
    test(`keeps the dialog open and says why ${name} can't open`, async ({ page }) => {
      await pasteDiagram(page, text);

      await expect(page.locator('#ai-error')).toHaveAttribute('open', '');
      await expect(page.locator('#ai-error-text')).toHaveText(message);
      await expect(page.locator('#ai-dialog')).toHaveAttribute('open', '');
      await expect(page.locator('#landing')).toBeVisible();
      await expect(page.locator('#ai-paste')).toHaveJSProperty('value', text);
    });
  }

  function dataProviderUnopenablePastes() {
    return [
      ['an empty box', '', 'Could not open that diagram: Paste the document the agent wrote first.'],
      ['a reply without JSON', 'Sorry, I could not read the screenshot.', /^Could not open that diagram: That isn't valid JSON: /],
      ['JSON that is no Nexus document', '{ "nexus": 1 }', 'Could not open that diagram: Not a valid Nexus document.'],
    ];
  }

  test('clears the error when the dialog opens again', async ({ page }) => {
    await pasteDiagram(page, 'not json');
    await expect(page.locator('#ai-error')).toHaveAttribute('open', '');

    await page.click('#ai-close');
    await expect(page.locator('#ai-dialog')).not.toHaveAttribute('open');
    await page.click('#landing-ai');

    await expect(page.locator('#ai-error')).not.toHaveAttribute('open');
  });
});
