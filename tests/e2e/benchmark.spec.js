import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { documentLink, encodeDocument } from '../../src/doc-link.js';
import { BENCHMARK_DIAGRAMS, INTERACTIONS, benchmarkDocument, measureDiagram } from '../../scripts/lib/benchmark-page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test.describe('Benchmark', { tag: '@runner-1' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  for (const diagram of BENCHMARK_DIAGRAMS) {
    test('measures ' + diagram.label + ' through every step', async ({ browser, baseURL }) => {
      test.setTimeout(120000);

      const link = documentLink(new URL('/index.html', baseURL).href, await encodeDocument(benchmarkDocument(ROOT, diagram.id)));
      const measurement = await measureDiagram(browser, link, { interactions: diagram.interactions, throttle: 1 });

      expect(measurement.load).toBeGreaterThan(0);
      expect(measurement.blocking).toBeGreaterThanOrEqual(0);
      expect(measurement.heap).toBeGreaterThan(1024 * 1024);
      expect(Object.keys(measurement.interactions)).toEqual(diagram.interactions ? INTERACTIONS.map((interaction) => interaction.id) : []);
      Object.values(measurement.interactions).forEach((time) => expect(time).toBeGreaterThan(0));
    });
  }

  test('fails a diagram that does not open', async ({ browser, baseURL }) => {
    const link = new URL('/index.html#doc=not-a-diagram', baseURL).href;

    await expect(measureDiagram(browser, link, { interactions: false, throttle: 1 })).rejects.toThrow(/The diagram did not open: Could not open that diagram/);
  });
});
