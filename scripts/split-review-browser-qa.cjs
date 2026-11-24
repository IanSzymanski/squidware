// Start the production preview and make Playwright and Chromium available before running.
'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const output = path.resolve(process.env.SQUIDWARE_REVIEW_OUTPUT ?? '.qa/split-review');
const url = process.env.SQUIDWARE_REVIEW_URL ?? 'http://127.0.0.1:5193/';

function trackEditor(disableWebGL = false) {
  if (disableWebGL) {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : get.call(this, type, ...args);
    };
  }
  window.__reviewQA = {};
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject: () => 1, onCommitFiberUnmount() {},
    onCommitFiberRoot(_id, root) {
      let shadow = null;
      function visit(node) {
        if (!node) return;
        const props = node.memoizedProps;
        const value = props?.value;
        if (value?.getState && value?.dispatch) window.__reviewQA.store = value;
        if (props?.project?.field && props.positions && props.cueTiming && props.splitReview) shadow = props;
        visit(node.child);
        visit(node.sibling);
      }
      visit(root.current);
      window.__reviewQA.stage = shadow;
    },
  };
}

async function ready(page, fixture) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__reviewQA.store);
  const current = await page.evaluate(() => window.__reviewQA.store.getState().project.present.id);
  await page.locator('input[accept=".squid,.json"]').setInputFiles(fixture);
  await page.waitForFunction(previous => window.__reviewQA.store.getState().project.present.id !== previous, current);
}

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const button = (page, name) => page.getByRole('button', { name, exact: true });
const state = page => page.evaluate(() => {
  const s = window.__reviewQA.store.getState();
  return { view:s.ui.view, count:s.playback.count, revision:s.project.revision, selected:s.selection.selectedIds, positions:s.project.present.sets[s.selection.activeIndex].positions };
});
const dispatch = (page, id, args) => page.evaluate(([id,args]) => window.__reviewQA.store.dispatch(id, args), [id,args]);
const stage = page => page.evaluate(() => {
  const p = window.__reviewQA.stage;
  return p && { selected:p.selectedIds, positions:p.positions, cue:p.cueTiming, quality:p.quality };
});
const screenshot = (page, name) => page.screenshot({ path: path.join(output, name + '.png') });
const reviewCanvas = page => page.locator('.field-viewports__preview .stage-three__canvas canvas');
const coordinates = dot => dot.evaluate(node => {
  const point = new DOMPoint().matrixTransform(node.getScreenCTM());
  return { x:point.x, y:point.y };
});
const frame = (page, dimensions) => page.waitForFunction(({ w,h }) => {
  const canvas = document.querySelector('.field-viewports__preview .stage-three__canvas canvas');
  return canvas && canvas.width >= w && canvas.height >= h;
}, dimensions);

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.SQUIDWARE_CHROMIUM, headless: true, args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const errors = [];
  const page = await browser.newPage({ viewport:{ width:1366, height:768 } });
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(trackEditor);
  try {
    await ready(page, 'format/examples/basic-v2.squid');
    await screenshot(page, 'before');
    await button(page, 'Switch workspace').click();
    await button(page, 'Review workspace').click();
    await frame(page, { w:240,h:150 });
    const divider = page.getByRole('separator', { name:'Resize field and 3D preview' });
    assert.equal(await divider.getAttribute('aria-orientation'), 'vertical');
    const canvas = reviewCanvas(page);
    await canvas.evaluate(element => { window.__firstReviewCanvas = element; });

    const before = await state(page);
    const dot = page.locator('.field-stage__svg [data-performer-id="a"]');
    const point = await coordinates(dot);
    await page.mouse.click(point.x, point.y);
    assert.deepEqual((await stage(page)).selected, ['a']);
    assert.equal((await state(page)).revision, before.revision);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 40, point.y + 24, { steps: 4 });
    await page.waitForFunction(initial => window.__reviewQA.stage?.positions.a.x > initial.x + 1, before.positions.a);
    const draft = (await stage(page)).positions.a;
    assert.deepEqual((await state(page)).positions.a, before.positions.a);
    await page.mouse.up();
    await page.waitForFunction(original => window.__reviewQA.store.getState().project.revision > original, before.revision);
    assert.deepEqual((await state(page)).positions.a, draft);
    assert.deepEqual((await stage(page)).positions.a, draft);
    await screenshot(page, 'review-edit');

    const camera = page.getByRole('combobox', { name:'Review camera' });
    for (const preset of ['press-box','front','top']) {
      await camera.selectOption(preset);
      await page.waitForFunction(value => window.__reviewQA.store.getState().ui.camera.preset === value, preset);
    }
    await settle(page);
    await screenshot(page, 'review-overhead');

    await dispatch(page, 'playback.scrub', { count: 5.25 });
    await page.waitForFunction(() => window.__reviewQA.stage?.cueTiming?.localCount === 5.25);
    const scrub = await stage(page);
    assert.ok(scrub.positions.a.x > draft.x && scrub.positions.a.x < 30);
    await dispatch(page, 'set.select', { index: 0 });
    await dispatch(page, 'coordinates.preview', { mode:'absolute', text:'Side 1: on the 20; on back hash' });
    assert.equal((await state(page)).view, 'split');
    await page.waitForFunction(() => window.__reviewQA.stage?.positions.a.x === 20);
    await dispatch(page, 'coordinates.cancel');
    assert.deepEqual((await stage(page)).positions.a, draft);

    const value = () => divider.getAttribute('aria-valuenow').then(Number);
    await divider.focus();
    const original = await value();
    await page.keyboard.press('ArrowRight');
    assert.ok(await value() > original);
    const panel = await divider.boundingBox();
    await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2);
    await page.mouse.down();
    await page.mouse.move(panel.x - 85, panel.y + panel.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.ok(await value() <= original);
    assert.equal(await canvas.evaluate(node => node === window.__firstReviewCanvas), true);
    await button(page, '3D preview').click();
    assert.equal(await canvas.evaluate(node => node === window.__firstReviewCanvas), true);
    await button(page, 'Split review').click();
    assert.equal(await canvas.evaluate(node => node === window.__firstReviewCanvas), true);

    await page.setViewportSize({ width: 900, height: 768 });
    await page.evaluate(() => {
      const { store } = window.__reviewQA;
      store.setValue('preferences', 'value', { ...store.getState().preferences.value, theme:'high-contrast', uiScale:1.5 });
    });
    await page.waitForFunction(() => document.querySelector('.field-viewports').dataset.layout === 'stacked');
    assert.equal(await divider.getAttribute('aria-orientation'), 'horizontal');
    await divider.focus();
    await page.keyboard.press('ArrowDown');
    await screenshot(page, 'review-stacked');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.field-viewports__preview'));
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '2D field');
    assert.equal(await page.locator('.field-stage__svg').count(), 1);

    await page.setViewportSize({ width:1366,height:768 });
    await page.evaluate(() => {
      const { store } = window.__reviewQA;
      store.setValue('preferences', 'value', { ...store.getState().preferences.value, theme:'dark', uiScale:1 });
    });
    await page.locator('input[accept=".squid,.json"]').setInputFiles('format/examples/maximum-v2.squid');
    await page.waitForFunction(() => window.__reviewQA.store.getState().project.present.performers.length === 500);
    await button(page, 'Split review').click();
    await frame(page, { w:240,h:150 });
    assert.equal(Object.keys((await stage(page)).positions).length, 500);
    const initial = await state(page);
    const id = Object.keys(initial.positions)[0];
    const place = { x: Math.min(initial.positions[id].x + 2, 100), y: initial.positions[id].y };
    assert.equal(await dispatch(page,'positions.move',{ index:0, updates:{[id]:place} }), true);
    await page.waitForFunction(({ id, x }) => window.__reviewQA.stage?.positions[id].x === x, { id, x:place.x });
    await page.locator('.play-button').click();
    await page.waitForFunction(() => window.__reviewQA.store.getState().playback.count > 3 && window.__reviewQA.stage?.cueTiming?.localCount > 2);
    await page.locator('.play-button').click();
    await screenshot(page, 'review-maximum');
    await button(page, '2D field').click();
    assert.equal(await canvas.count(), 0);
    assert.deepEqual(errors, []);

    const fallback = await browser.newPage({ viewport:{ width:1366,height:768 } });
    await fallback.addInitScript(trackEditor, true);
    await ready(fallback, 'format/examples/basic-v2.squid');
    await button(fallback, 'Split review').click();
    await fallback.getByText('3D preview unavailable').waitFor();
    const fallbackDot = fallback.locator('.field-stage__svg [data-performer-id="a"]');
    const fallbackPoint = await coordinates(fallbackDot);
    await fallback.mouse.click(fallbackPoint.x, fallbackPoint.y);
    assert.deepEqual((await state(fallback)).selected, ['a']);
    await screenshot(fallback, 'review-fallback');
    await button(fallback, 'Return to 2D field').click();
    assert.equal((await state(fallback)).view, '2d');
    await fallback.close();

    const report = { browser:browser.version(), checks:[
      'Review workspace and synchronized selection without a project edit',
      'Real 2D drag and coordinate draft mirrored before commit, with the same 3D arrival after commit',
      'Fractional count scrub and shared playback',
      'Front, overhead and press-box presets',
      'Pointer and keyboard resizing, high-contrast stacked layout at 150%, and keyboard collapse',
      'Same WebGL canvas across layout changes and teardown on 2D-only view',
      '500 performers and 128 sets with editing and playback',
      '2D selection and recovery with WebGL disabled',
    ] };
    await fs.writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error({ errors, state: await state(page).catch(() => null) });
    await screenshot(page, 'failed');
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
