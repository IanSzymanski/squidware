// Start pnpm dev and make Playwright and Chromium available before running.
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = process.env.SQUIDWARE_CUE_URL ?? 'http://127.0.0.1:5173/';
const output = path.resolve(process.env.SQUIDWARE_CUE_OUTPUT ?? '.qa/choreography');
const viewport = { width: 1366, height: 768 };
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));

function instrumentEditor() {
  window.__cueQA = {};
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      function visit(fiber) {
        if (!fiber) return;
        const store = fiber.memoizedProps?.value;
        if (store?.getState && store?.dispatch) window.__cueQA.store = store;
        visit(fiber.child);
        visit(fiber.sibling);
      }
      visit(root.current);
    },
  };
}

async function reviewEditor(browser) {
  const page = await browser.newPage({ viewport, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(instrumentEditor);
    await page.goto(root);
    const input = page.locator('input[accept=".squid,.json"]');
    await page.waitForFunction(() => !!window.__cueQA.store);
    await input.setInputFiles('format/examples/equipment-v14.squid');
    await page.waitForFunction(() => window.__cueQA.store.getState().project.present.performers.some(person => person.id === 'b'));
    const present = () => page.evaluate(() => window.__cueQA.store.getState().project.present);
    const dispatch = (id, args) => page.evaluate(([id, args]) => window.__cueQA.store.dispatch(id, args), [id, args]);
    const select = ids => page.evaluate(ids => window.__cueQA.store.setValue('selection', 'selectedIds', ids), ids);
    const button = name => page.getByRole('button', { name, exact: true });
    const dialog = page.getByRole('dialog', { name: 'Choreography cues' });
    const before = await present();
    await dispatch('set.select', { index: 1 });
    await select(['a', 'b']);
    await button('Choreography cues').click();
    await button('Add cue').click();
    await dialog.getByRole('combobox', { name: 'Preset' }).selectOption('flag-up');
    assert.equal(await button('Save cue').isDisabled(), true);
    await dialog.getByText(/Assign flag equipment to A1/).waitFor();
    await button('Cancel edit').click();
    await button('Done').click();

    await select(['b']);
    await button('Choreography cues').click();
    async function add(preset) {
      await button('Add cue').click();
      await dialog.getByRole('combobox', { name: 'Preset' }).selectOption(preset);
      await dialog.getByRole('spinbutton', { name: 'Start count' }).fill('2');
      await dialog.getByRole('spinbutton', { name: 'End count' }).fill('12');
      await button('Save cue').click();
    }
    await add('plie');
    await add('flag-up');
    await page.locator('h2').filter({ hasText: 'Choreography cues' }).hover();
    await page.screenshot({ path: path.join(output, 'cue-list.png') });
    const authored = await present();
    assert.deepEqual(authored.sets, before.sets);
    assert.deepEqual(authored.moves, before.moves);
    assert.deepEqual(authored.choreography.map(cue => cue.performerIds), [['b'], ['b']]);
    await button('Edit Plié in second position cue at count 2').click();
    await dialog.getByRole('spinbutton', { name: 'Plié depth · yards' }).fill('.12');
    await button('Save cue').click();
    assert.equal((await present()).choreography[0].depth, .12);
    await button('Remove Flag up cue at count 2').click();
    assert.equal((await present()).choreography.length, 1);
    await dispatch('history.undo');
    assert.equal((await present()).choreography.length, 2);
    await dispatch('history.redo');
    assert.equal((await present()).choreography.length, 1);
    await dispatch('history.undo');

    await page.setViewportSize({ width: 670, height: 860 });
    await page.evaluate(() => {
      const { store } = window.__cueQA;
      store.setValue('preferences', 'value', { ...store.getState().preferences.value, theme: 'high-contrast', uiScale: 1.25 });
    });
    await button('Edit Plié in second position cue at count 2').click();
    assert.equal(await dialog.getByRole('combobox', { name: 'Preset' }).evaluate(element => document.activeElement === element), true);
    await page.keyboard.press('Tab');
    await settle(page);
    await page.screenshot({ path: path.join(output, 'cue-compact.png') });
    await button('Cancel edit').click();
    await page.setViewportSize(viewport);
    await button('Review Plié in second position cue at count 2').click();
    await page.locator('.stage-three canvas').waitFor();
    assert.equal(await page.evaluate(() => window.__cueQA.store.getState().playback.count), 4);
    await page.getByRole('combobox', { name: '3D quality' }).selectOption('lightweight');
    await settle(page);
    assert.equal(await page.locator('.stage-three [role=alert]').count(), 0);

    const downloadPromise = page.waitForEvent('download');
    await button('Save').click();
    const download = await downloadPromise;
    const filename = path.join(output, 'saved-cues.squid');
    await download.saveAs(filename);
    const wire = JSON.parse(await fs.readFile(filename, 'utf8'));
    assert.equal(wire.schemaVersion, 15);
    assert.equal(wire.choreography.length, 2);
    await input.setInputFiles(filename);
    await page.waitForFunction(() => window.__cueQA.store.getState().project.past.length === 0);
    assert.deepEqual((await present()).choreography, wire.choreography);
    assert.deepEqual(errors, []);
    return 'Real editor controls rejected mixed flag assignments, added and edited both tracks, removed and restored a cue, reviewed its peak, and saved and reopened v15.';
  } catch (error) {
    if (errors.length) console.error('Editor renderer errors:', errors);
    throw error;
  } finally {
    await page.close();
  }
}

async function reviewPoses(browser) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('examples/leg-motion/', root).href);
  const combo = name => page.getByRole('combobox', { name, exact: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const slider = page.getByRole('slider', { name: 'Count' });
  const canvas = page.locator('.stage-three canvas');
  await combo('Motion').selectOption('choreography');
  await canvas.waitFor();
  const seek = async count => { await slider.fill(String(count)); await settle(page); };
  for (const angle of ['front', 'side', 'press']) {
    await combo('Camera view').selectOption(angle);
    for (const count of [0, .5, 1, 4, 7, 8]) {
      await seek(count);
      await canvas.screenshot({ path: path.join(output, `${angle}-${count}.png`) });
    }
  }
  await combo('Camera view').selectOption('front');
  await seek(3.25);
  const atCount = await canvas.screenshot();
  await combo('Speed').selectOption('2');
  await button('Play').click();
  await page.waitForFunction(() => Number(document.querySelector('output').textContent) > 4);
  await button('Pause').click();
  const frozen = await page.locator('output').innerText();
  await settle(page);
  const frozenPixels = await canvas.screenshot();
  await page.waitForTimeout(240);
  assert.equal(await page.locator('output').innerText(), frozen);
  assert.deepEqual(await canvas.screenshot(), frozenPixels);
  await seek(7.75);
  await button('Play').click();
  await page.waitForFunction(() => Number(document.querySelector('output').textContent) < 2);
  await button('Pause').click();
  await seek(3.25);
  assert.deepEqual(await canvas.screenshot(), atCount);
  await page.screenshot({ path: path.join(output, 'preview.png') });

  const stats = () => page.locator('.leg-motion-example__stage').evaluate(node => JSON.parse(node.dataset.stageStats));
  const toggle = page.getByRole('checkbox', { name: 'Animate cues' });
  const benchmarks = [];
  await combo('Camera view').selectOption('ensemble');
  await combo('Speed').selectOption('1');
  for (const cast of [64, 500]) {
    await combo('Cast').selectOption(String(cast));
    for (const animated of [false, true]) {
      await toggle.setChecked(animated);
      await seek(4);
      const metrics = await stats();
      await button('Play').click();
      const samples = await page.evaluate(() => new Promise(resolve => {
        const intervals = [];
        const start = performance.now();
        let last;
        function tick(now) {
          if (last !== undefined) intervals.push(now - last);
          last = now;
          if (now - start < 3200) requestAnimationFrame(tick);
          else resolve(intervals.sort((a, b) => a - b));
        }
        requestAnimationFrame(tick);
      }));
      await button('Pause').click();
      assert.ok(samples.length > 3);
      benchmarks.push({ cast, animated, ...metrics, samples: samples.length,
        medianMs: +samples[Math.floor(samples.length * .5)].toFixed(1),
        p95Ms: +samples[Math.floor(samples.length * .95)].toFixed(1) });
    }
  }
  assert.deepEqual(errors, []);
  const backend = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('webgl2');
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, renderer: context.getParameter(debug.UNMASKED_RENDERER_WEBGL) };
  });
  await page.close();
  return { backend, benchmarks, interactions: [
    'Front, side and press-box captures cover the left-foot step, planted stance, plié and return to neutral.',
    'Pause froze the count and canvas. Playback at 2× wrapped, and reversing to the same fractional count reproduced the same render.',
  ] };
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.SQUIDWARE_CHROMIUM, headless: true,
    args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const report = await reviewPoses(browser);
    report.interactions.push(await reviewEditor(browser));
    const data = JSON.stringify(report, null, 2) + '\n';
    await fs.writeFile(path.join(output, 'report.json'), data);
    process.stdout.write(data);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
