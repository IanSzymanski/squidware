// Serve the production build and make Playwright and Chromium available.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.env.SQUIDWARE_FRONT_ENSEMBLE_URL ?? 'http://127.0.0.1:4173/';
const output = path.resolve(process.env.SQUIDWARE_FRONT_ENSEMBLE_OUTPUT ?? '.qa/front-ensemble');
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const select = (scope, name) => scope.getByRole('combobox', { name, exact: true });
const number = (scope, name) => scope.getByRole('spinbutton', { name, exact: true });

async function replay(page) {
  const sample = JSON.parse(await fs.readFile('format/examples/front-ensemble-v19.squid', 'utf8'));
  const baseline = { ...sample, id: 'palette-before', title: 'Palette placement review', stagingObjects: [],
    sets: sample.sets.map(({ staging, ...set }) => set) };
  await page.addInitScript(() => {
    const prototype = WebGL2RenderingContext.prototype;
    const draw = prototype.drawElementsInstanced;
    prototype.drawElementsInstanced = function (mode, count, type, offset, instances) {
      window.frontEnsembleDraws?.push({ count, instances });
      return draw.apply(this, arguments);
    };
  });
  await page.goto(url);
  const file = page.locator('input[accept=".squid,.json"]');
  const modal = page.getByRole('dialog', { name: 'Staging props' });
  const field = page.locator('.field-stage__background');
  const models = field.locator('[data-staging-model]');
  const staged = name => models.filter({ has: page.locator('title', { hasText: new RegExp(`^${name}$`) }) });
  const canvas = page.locator('.stage-three__canvas canvas');
  const snapshot = (name, scope = page) => scope.screenshot({ path: path.join(output, `${name}.png`) });

  async function load(project) {
    await file.setInputFiles({ name: `${project.id}.squid`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    await page.waitForFunction(title => document.querySelector('.project-title')?.textContent.trim() === title, project.title);
  }
  async function props() {
    const toolbar = page.getByRole('toolbar', { name: 'Field tools' });
    const direct = button(toolbar, 'Staging props');
    if (await direct.isVisible()) await direct.click();
    else {
      await button(toolbar, 'More field tools').click();
      await toolbar.getByRole('menuitem', { name: 'Staging props', exact: true }).click();
    }
    await modal.waitFor();
  }
  async function closeProps() {
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });
  }
  async function apply() {
    await button(modal, 'Apply prop').click();
    await select(modal, 'Prop').waitFor();
  }
  async function settle() {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function camera(name) {
    await button(page, 'Saved camera views').click();
    const saved = page.getByRole('dialog', { name: 'Saved camera views' });
    await select(saved, 'Camera view').selectOption({ label: name });
    await button(saved, 'Use view').click();
    await saved.waitFor({ state: 'hidden' });
    await settle();
  }
  async function scrub(count) {
    await page.getByRole('slider', { name: 'Timeline playhead' }).fill(String(count));
    await page.waitForFunction(value => document.querySelector('.show-count strong')?.textContent === String(value), count);
    await settle();
  }
  async function drawSample(count) {
    await page.evaluate(() => { window.frontEnsembleDraws = []; });
    await scrub(count);
    const draws = await page.evaluate(() => {
      const result = window.frontEnsembleDraws;
      window.frontEnsembleDraws = null;
      return result;
    });
    return { calls: draws.length, instances: draws.reduce((sum, draw) => sum + draw.instances, 0),
      indices: draws.reduce((sum, draw) => sum + draw.instances * draw.count, 0) };
  }

  await load(baseline);
  await button(page, 'Split review').click();
  await canvas.waitFor();
  const fieldHeight = await page.locator('.field-container').evaluate(element => element.getBoundingClientRect().height);
  assert.ok(fieldHeight >= 470);
  await camera('Pit press box');
  await snapshot('before');
  const withoutModels = await drawSample(8);
  assert.ok(withoutModels.calls > 0);
  await button(page, 'First set').click();
  await props();
  const palette = select(modal, 'Prop type');
  assert.deepEqual(await palette.locator('optgroup[label="Front ensemble"] option').allTextContents(), sample.stagingObjects.map(item => item.name));
  await palette.focus();
  await palette.press('ArrowDown');
  assert.equal(await palette.inputValue(), 'marimba');
  await snapshot('palette');
  await button(modal, 'Add prop').click();
  assert.equal(await modal.getByRole('textbox', { name: 'Prop name' }).inputValue(), 'Marimba');
  assert.equal(await number(modal, 'Planning width · yd').inputValue(), '2.25');
  await number(modal, 'Center X · yd').fill('46');
  await number(modal, 'Center Y · yd').fill('49');
  await apply();
  await button(modal, 'Add prop').click();
  assert.equal(await modal.getByRole('textbox', { name: 'Prop name' }).inputValue(), 'Marimba 2');
  await number(modal, 'Center X · yd').fill('53');
  await number(modal, 'Center Y · yd').fill('49');
  await apply();
  await closeProps();
  assert.equal(await models.count(), 2);

  await button(page, 'Next set').click();
  await props();
  await select(modal, 'Prop').selectOption({ label: 'Marimba' });
  await button(modal, 'Edit prop').click();
  await number(modal, 'Orientation · degrees').fill('90');
  await number(modal, 'Planning width · yd').fill('3.75');
  await modal.getByRole('checkbox', { name: 'Visible at this set' }).uncheck();
  await snapshot('pose');
  await apply();
  await closeProps();
  assert.equal(await staged('Marimba').count(), 0);
  assert.equal(await staged('Marimba 2').getAttribute('transform'), 'translate(53 49) rotate(0)');
  await button(page, 'Undo').click();
  assert.equal(await staged('Marimba').getAttribute('transform'), 'translate(46 49) rotate(0)');
  await button(page, 'Redo').click();
  assert.equal(await staged('Marimba').count(), 0);
  await scrub(8);
  assert.equal(await staged('Marimba').getAttribute('transform'), 'translate(46 49) rotate(-45)');
  assert.equal(await staged('Marimba 2').getAttribute('transform'), 'translate(53 49) rotate(0)');
  await button(page, 'Next set').click();

  const pending = page.waitForEvent('download');
  await button(page, 'Save').click();
  const authored = path.join(output, 'authored.squid');
  await (await pending).saveAs(authored);
  const saved = JSON.parse(await fs.readFile(authored, 'utf8'));
  assert.equal(saved.schemaVersion, 19);
  assert.deepEqual(saved.performers, sample.performers);
  assert.deepEqual(saved.stagingObjects.map(item => item.model), ['marimba', 'marimba']);
  const [left, right] = saved.stagingObjects;
  assert.notEqual(left.id, right.id);
  assert.equal(saved.sets[1].staging[left.id].width, 3.75);
  assert.equal(saved.sets[1].staging[left.id].visible, false);
  assert.equal(saved.sets[1].staging[right.id].width, 2.25);
  assert.equal(saved.sets[1].staging[right.id].visible, true);
  await file.setInputFiles(authored);
  await staged('Marimba').waitFor({ state: 'attached' });
  await button(page, 'Next set').click();
  assert.equal(await staged('Marimba').count(), 0);
  assert.equal(await staged('Marimba 2').count(), 1);

  await load(sample);
  const quality = select(page, '3D quality');
  assert.equal(await quality.inputValue(), 'lightweight');
  for (const [name, view] of [['front', 'Pit front'], ['side', 'Pit side'], ['press-box', 'Pit press box']]) {
    await camera(view);
    await snapshot(name, canvas);
  }
  const transforms = await models.evaluateAll(elements => elements.map(element => element.getAttribute('transform')));
  assert.equal(transforms.length, 6);
  const performer = page.locator('.field-stage__svg [data-performer-id="brass-1"]');
  const openingPosition = await performer.getAttribute('transform');
  const withModels = await drawSample(8);
  assert.notEqual(await performer.getAttribute('transform'), openingPosition);
  assert.deepEqual(await models.evaluateAll(elements => elements.map(element => element.getAttribute('transform'))), transforms);
  assert.ok(withModels.instances > withoutModels.instances);
  assert.ok(withModels.calls > withoutModels.calls);
  await snapshot('sample');
  await button(page, 'First set').click();
  await page.setViewportSize({ width: 940, height: 650 });
  await button(page, 'Project menu').click();
  await button(page, 'Preferences').click();
  await select(page, 'Interface theme').selectOption('high-contrast');
  await select(page, 'UI scale').selectOption('1.5');
  await page.keyboard.press('Escape');
  await button(page, '2D field').click();
  await props();
  await select(modal, 'Prop type').selectOption('rack');
  await snapshot('high-contrast-150');
  await button(modal, 'Add prop').click();
  await button(modal, 'Cancel').click();
  await closeProps();
  await fs.writeFile(path.join(output, 'review.json'), JSON.stringify({ fieldHeight, performers: sample.performers.length,
    sets: sample.sets.length, models: transforms.length, withoutModels, withModels }, null, 2) + '\n');
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.SQUIDWARE_CHROMIUM, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await replay(page);
    assert.deepEqual(errors, []);
    console.log('Front ensemble replay passed palette placement, independent equipment poses, undo, save/reopen and stationary 3D review.');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
