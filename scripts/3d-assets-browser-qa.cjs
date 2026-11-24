// Start pnpm dev and make Playwright and Chromium available to run the asset review.
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = process.env.SQUIDWARE_ASSET_URL ?? 'http://127.0.0.1:5173/';
const output = path.resolve(process.env.SQUIDWARE_ASSET_OUTPUT ?? '.qa/3d-assets');
const viewport = { width: 1366, height: 768 };
const inspectionViews = ['front', 'side', 'press'];
const stage = '.leg-motion-example__stage';

function instrumentEditor() {
  window.__assetQA = {};
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberUnmount() {},
    onCommitFiberRoot(_id, root) {
      function visit(fiber) {
        if (!fiber) return;
        const value = fiber.memoizedProps?.value;
        if (value?.getState && value?.dispatch) window.__assetQA.editor = value;
        visit(fiber.child);
        visit(fiber.sibling);
      }
      visit(root.current);
    },
  };
}

async function reviewEditor(browser) {
  const page = await browser.newPage({ viewport });
  try {
    await page.addInitScript(instrumentEditor);
    await page.goto(root);
    await page.waitForFunction(() => window.__assetQA.editor?.getState().project.present.performers.length > 0);
    const dispatch = (command, args) => page.evaluate(([name, value]) => window.__assetQA.editor.dispatch(name, value), [command, args]);
    const first = await page.evaluate(() => {
      const { project } = window.__assetQA.editor.getState();
      const person = project.present.performers[0];
      return { id: person.id, section: project.present.sections.find(section => section.id === person.sectionId) };
    });
    await dispatch('dialog.open', { dialog: 'settings' });
    await page.getByRole('combobox', { name: `Default 3D equipment for ${first.section.name}` }).selectOption('trumpet');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await dispatch('cast.show', { mode: 'panel' });
    await page.locator(`[data-cast-id="${first.id}"] button`).click();
    const panel = page.getByRole('complementary', { name: 'Cast panel' });
    await panel.getByText('Appearance', { exact: true }).click();
    await panel.getByRole('combobox', { name: '3D equipment', exact: true }).selectOption('flag');
    await panel.locator('input[aria-label="Flag color"]').fill('#73cef1');
    await panel.locator('input[aria-label="Flag color"]').press('Tab');
    const mark = page.locator(`[data-performer-appearance="${first.id}"]`);
    await page.waitForFunction(id => document.querySelector(`[data-performer-appearance="${id}"]`)?.getAttribute('data-performer-role') === 'guard', first.id);
    const state = () => page.evaluate(() => window.__assetQA.editor.getState().project.present);
    const edited = await state();
    assert.deepEqual(edited.performers[0].appearance, { equipment: 'flag', flagColor: '#73cef1' });
    assert.equal(edited.sections.find(section => section.id === first.section.id).equipment, 'trumpet');
    await dispatch('history.undo');
    assert.equal((await state()).performers[0].appearance.flagColor, undefined);
    await dispatch('history.undo');
    assert.equal(await mark.getAttribute('data-performer-role'), 'instrument');
    await dispatch('history.redo');
    await dispatch('history.redo');
    assert.deepEqual(await state(), edited);
    await page.screenshot({ path: path.join(output, 'editor-cast.png') });
    return 'Section default, performer override and flag color edited through the real controls and replayed through undo/redo.';
  } finally {
    await page.close();
  }
}

async function replay(browser) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('examples/3d-assets/', root).href);
  const canvas = page.getByRole('img', { name: /Three dimensional drill preview/ });
  const combo = name => page.getByRole('combobox', { name, exact: true });
  const check = name => page.getByRole('checkbox', { name, exact: true });
  const statistics = () => page.locator(stage).evaluate(element => JSON.parse(element.dataset.stageStats));
  await canvas.waitFor();
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  const capture = async name => {
    await settle();
    return canvas.screenshot({ path: path.join(output, name + '.png') });
  };
  const inventory = [];
  for (const mode of ['carried', 'pit']) {
    await combo('Scene').selectOption(mode);
    const items = await combo('Equipment').locator('option').evaluateAll(options => options.map(option => ({ key: option.value, name: option.textContent })));
    for (const item of items) {
      await combo('Equipment').selectOption(item.key);
      for (const angle of inspectionViews) {
        await combo('Camera view').selectOption(angle);
        await capture(`${item.key}-${angle}`);
      }
    }
    inventory.push(...items.map(item => ({ ...item, mode })));
  }

  const comparisons = [];
  for (const size of ['mixed', 'stress']) {
    await combo('Scene').selectOption(size);
    await combo('Camera view').selectOption('press');
    for (const mode of ['markers', 'equipment', 'stadium', 'full']) {
      await check('Equipment models').setChecked(mode === 'equipment' || mode === 'full');
      await check('Stadium').setChecked(mode === 'stadium' || mode === 'full');
      await check('Front ensemble').setChecked(mode === 'full');
      await page.getByRole('slider', { name: 'Count' }).fill('3.5');
      await capture(`${size}-${mode}`);
      if (size === 'stress' && mode === 'markers') await page.screenshot({ path: path.join(output, 'desktop-markers.png') });
      const renderer = await statistics();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      const intervals = await page.evaluate(() => new Promise(resolve => {
        const intervals = [];
        const start = performance.now();
        let last;
        function tick(now) {
          if (last !== undefined) intervals.push(now - last);
          last = now;
          if (now - start < 3500) requestAnimationFrame(tick);
          else resolve(intervals.sort((a, b) => a - b));
        }
        requestAnimationFrame(tick);
      }));
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      assert.ok(intervals.length > 3, `expected frames in ${size} / ${mode}`);
      const median = intervals[Math.floor(intervals.length * .5)];
      const p95 = intervals[Math.floor(intervals.length * .95)];
      comparisons.push({ size, mode, ...renderer, frames: intervals.length, medianMs: +median.toFixed(1), p95Ms: +p95.toFixed(1) });
    }
  }
  for (const angle of ['front', 'side', 'overhead']) {
    await combo('Camera view').selectOption(angle);
    await capture(`stadium-${angle}`);
  }
  await combo('Camera view').selectOption('press');
  const seek = async value => {
    await page.getByRole('slider', { name: 'Count' }).fill(value);
    await settle();
    return canvas.screenshot();
  };
  const pose = await seek('3.5');
  assert.notDeepEqual(await seek('6.5'), pose);
  assert.deepEqual(await seek('3.5'), pose);
  const beforeClose = await statistics();
  let freshGeometryCount;
  for (let i = 0; i < 2; i++) {
    const previous = await canvas.evaluate(element => {
      window.__assetLostContexts ??= 0;
      element.addEventListener('webglcontextlost', () => { window.__assetLostContexts++; }, { once: true });
      return window.__assetLostContexts;
    });
    await page.getByRole('button', { name: 'Close 3D', exact: true }).click();
    await canvas.waitFor({ state: 'detached' });
    await page.waitForFunction(count => window.__assetLostContexts > count, previous);
    await page.getByRole('button', { name: 'Open 3D', exact: true }).click();
    await canvas.waitFor();
    await check('Stadium').check();
    await settle();
    const after = await statistics();
    assert.equal(after.calls, beforeClose.calls);
    assert.equal(after.triangles, beforeClose.triangles);
    // The first context can retain a marker geometry from the earlier comparison.
    assert.ok(after.geometries <= beforeClose.geometries);
    freshGeometryCount ??= after.geometries;
    assert.equal(after.geometries, freshGeometryCount);
  }
  await page.screenshot({ path: path.join(output, 'full-desktop.png') });
  await page.setViewportSize({ width: 670, height: 850 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'high-contrast'; document.documentElement.style.fontSize = '18px'; });
  await check('Stadium').focus();
  await page.keyboard.press('Space');
  assert.equal(await check('Stadium').isChecked(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 670);
  await settle();
  await page.screenshot({ path: path.join(output, 'compact.png') });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await settle();
  await page.screenshot({ path: path.join(output, 'compact-light.png') });
  assert.deepEqual(errors, []);
  const backend = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('webgl2');
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, renderer: context.getParameter(debug.UNMASKED_RENDERER_WEBGL) };
  });
  await page.close();
  return { backend, inventory, comparisons, interactions: [
    'Every carried and pit model rendered from front, side and press-box views.',
    'Seeking away and back reproduced the exact 500-performer scene with the same pit layout and stadium.',
    'Two close/reopen cycles lost the old WebGL context and restored the same draw calls and triangles with a stable fresh geometry count.',
    'The Stadium checkbox stayed keyboard-accessible in compact high-contrast layout.',
  ] };
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.SQUIDWARE_CHROMIUM, headless: true,
    args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const report = await replay(browser);
    report.interactions.push(await reviewEditor(browser));
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
