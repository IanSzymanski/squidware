// Start a Squidware preview and make Playwright, Chromium and ffmpeg available.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const output = path.resolve(process.env.SQUIDWARE_STAGING_OUTPUT ?? '.qa/staging');
const url = process.env.SQUIDWARE_STAGING_URL ?? 'http://127.0.0.1:4173/';
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const select = (scope, name) => scope.getByRole('combobox', { name, exact: true });
const input = (scope, name) => scope.getByRole('spinbutton', { name, exact: true });

function propPixels(file) {
  const width = 854, height = 480;
  const rgb = execFileSync('ffmpeg', ['-v', 'error', '-threads', '1', '-i', file, '-frames:v', '1', '-threads', '1',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
  assert.equal(rgb.length, width * height * 3);
  const regions = [{ pixels: 0, sumX: 0, sumY: 0 }, { pixels: 0, sumX: 0, sumY: 0 }];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    const red = rgb[i], green = rgb[i + 1], blue = rgb[i + 2];
    if (red < 70 || red - green < 12 || blue - green < 12) continue;
    const region = regions[x < width * .53 ? 0 : 1];
    region.pixels++; region.sumX += x; region.sumY += y;
  }
  return regions.map(({ pixels, sumX, sumY }) => ({ pixels, x: pixels ? sumX / pixels : null, y: pixels ? sumY / pixels : null }));
}

async function replay(page) {
  const fixture = JSON.parse(await fs.readFile('format/examples/basic-v2.squid', 'utf8'));
  fixture.title = 'Staging prop replay';
  fixture.moves[0] = { ...fixture.moves[0], counts: 16, tempo: 240, paths: {} };
  await page.goto(url);
  const upload = page.locator('input[accept=".squid,.json"]');
  await upload.setInputFiles({ name: 'staging-source.squid', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await page.waitForFunction(title => document.querySelector('.project-title')?.textContent.trim() === title, fixture.title);

  const field = page.locator('.field-stage__background');
  const prop = name => field.locator('[data-staging-id]').filter({ has: page.locator('title', { hasText: name }) });
  const modal = page.getByRole('dialog', { name: 'Staging props' });
  const screenshot = name => page.screenshot({ path: path.join(output, `${name}.png`) });
  async function open(activate = false) {
    const toolbar = page.getByRole('toolbar', { name: 'Field tools' });
    const direct = button(toolbar, 'Staging props');
    if (await direct.isVisible()) {
      if (activate) { await direct.focus(); await page.keyboard.press('Enter'); }
      else await direct.click();
    } else {
      await button(toolbar, 'More field tools').click();
      await toolbar.getByRole('menuitem', { name: 'Staging props', exact: true }).click();
    }
    await modal.waitFor();
  }
  async function close() {
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden' });
  }
  async function apply() { await button(modal, 'Apply prop').click(); await select(modal, 'Prop').waitFor(); }
  async function add(name, x, width, depth) {
    await button(modal, 'Add prop').click();
    await modal.getByRole('textbox', { name: 'Prop name' }).fill(name);
    await input(modal, 'Center X · yd').fill(String(x));
    await input(modal, 'Center Y · yd').fill('45');
    await input(modal, 'Width · yd').fill(String(width));
    await input(modal, 'Depth · yd').fill(String(depth));
    await input(modal, 'Height · yd').fill('3');
  }

  await button(page, 'Split review').click();
  await select(page, 'Review camera').selectOption('top');
  await page.locator('.stage-three__canvas canvas').waitFor();
  assert.equal(await field.locator('[data-staging-id]').count(), 0);
  const fieldHeight = await page.locator('.field-container').evaluate(element => element.getBoundingClientRect().height);
  assert.ok(fieldHeight >= 470);
  await screenshot('before');
  await open(true);
  assert.equal(await button(modal, 'Add prop').evaluate(element => document.activeElement === element), true);
  await add('Platform', 30, 9, 4);
  const preview = modal.getByRole('img', { name: 'Prop footprint preview' });
  const aimingPoint = await preview.evaluate(svg => {
    const point = new DOMPoint(30, 45).matrixTransform(svg.querySelector('g').getScreenCTM());
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(aimingPoint.x, aimingPoint.y);
  assert.ok(Math.abs(Number(await input(modal, 'Center X · yd').inputValue()) - 30) < .5);
  await input(modal, 'Center X · yd').fill('30');
  await input(modal, 'Center Y · yd').fill('45');
  await screenshot('placement');
  await apply();
  await add('Stationary deck', 75, 7, 4);
  await apply();
  await close();
  assert.equal(await prop('Platform').getAttribute('transform'), 'translate(30 45) rotate(0)');
  await page.locator('.field-performer[data-performer-id="a"] .field-dot').click();
  const selection = page.locator('.canvas-set-title .selection-count');
  assert.equal(await selection.textContent(), '1 selected');

  await button(page, 'Next set').click();
  await open();
  await select(modal, 'Prop').selectOption({ label: 'Platform' });
  await button(modal, 'Edit prop').click();
  await input(modal, 'Center X · yd').fill('50');
  await input(modal, 'Orientation · degrees').fill('90');
  await input(modal, 'Start count').fill('12');
  await input(modal, 'End count').fill('4');
  assert.equal(await button(modal, 'Apply prop').isDisabled(), true);
  await input(modal, 'Start count').fill('4');
  await input(modal, 'End count').fill('12');
  await modal.getByRole('checkbox', { name: 'Visible at this set' }).uncheck();
  await apply();
  assert.equal(await select(modal, 'Prop').inputValue(), await modal.locator('[data-staging-id] title').filter({ hasText: /^Platform \(hidden\)$/ }).locator('..').getAttribute('data-staging-id'));
  await close();
  assert.equal(await prop('Platform').count(), 0);
  assert.equal(await selection.textContent(), '1 selected');
  await button(page, 'Undo').click();
  assert.equal(await prop('Platform').getAttribute('transform'), 'translate(30 45) rotate(0)');
  await button(page, 'Redo').click();
  assert.equal(await prop('Platform').count(), 0);

  async function scrub(count) {
    await page.getByRole('slider', { name: 'Timeline playhead' }).fill(String(count));
    await page.waitForFunction(value => document.querySelector('.show-count strong')?.textContent === String(value), count);
  }
  for (const [count, value] of [[3, 'translate(30 45) rotate(0)'], [8, 'translate(40 45) rotate(-45)'], [13, 'translate(50 45) rotate(-90)']]) {
    await scrub(count);
    assert.equal(await prop('Platform').getAttribute('transform'), value);
    assert.equal(await prop('Stationary deck').getAttribute('transform'), 'translate(75 45) rotate(0)');
    if (count === 8) {
      await page.locator('.show-count strong').click();
      await screenshot('split-review');
    }
  }
  await scrub(16);
  assert.equal(await prop('Platform').count(), 0);
  await screenshot('arrival');
  await button(page, 'Saved camera views').click();
  await page.getByRole('textbox', { name: 'View name' }).fill('Staging overhead');
  await button(page, 'Save current angle').click();
  await page.getByRole('dialog', { name: 'Saved camera views' }).waitFor({ state: 'hidden' });

  const download = page.waitForEvent('download');
  await button(page, 'Save').click();
  const saved = path.join(output, 'staging.squid');
  await (await download).saveAs(saved);
  const data = JSON.parse(await fs.readFile(saved, 'utf8'));
  const platform = data.stagingObjects.find(object => object.name === 'Platform');
  assert.equal(data.schemaVersion, 18);
  assert.equal(data.sets[0].staging[platform.id].x, 30);
  assert.deepEqual(data.sets[1].staging[platform.id].travel, { start: .25, end: .75 });
  await upload.setInputFiles(saved);
  await prop('Platform').waitFor({ state: 'attached' });

  await button(page, 'Export').click();
  await button(page, 'Rehearsal video…').click();
  await select(page, 'End set').selectOption('1');
  await select(page, 'Camera view').selectOption({ label: 'Staging overhead' });
  await select(page, 'Resolution').selectOption('480p');
  await select(page, 'Frame rate').selectOption('15');
  await button(page, 'Render video').click();
  const videoError = page.getByRole('dialog', { name: 'Rehearsal video' }).getByRole('alert');
  await button(page, 'Save WebM').or(videoError).waitFor({ timeout: 120000 });
  assert.deepEqual(await videoError.allTextContents(), []);
  const clip = page.waitForEvent('download');
  await button(page, 'Save WebM').click();
  const video = path.join(output, 'staging.webm');
  await (await clip).saveAs(video);
  const frames = {};
  for (const [frame, time] of [['start', 0], ['middle', 2], ['arrival', 4]]) {
    const image = path.join(output, `video-${frame}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-threads', '1', '-ss', String(time), '-i', video, '-frames:v', '1', '-threads', '1', image]);
    frames[frame] = propPixels(image);
  }
  assert.ok(frames.start[0].pixels > 150 && frames.middle[0].pixels > 150);
  assert.ok(frames.middle[0].x - frames.start[0].x > 30);
  assert.equal(frames.arrival[0].pixels, 0);
  for (const frame of Object.values(frames)) {
    assert.ok(frame[1].pixels > 150);
    assert.ok(Math.abs(frame[1].x - frames.start[1].x) < 2);
  }
  await fs.writeFile(path.join(output, 'video-review.json'), JSON.stringify({ fieldHeight, frames }, null, 2) + '\n');
  await page.getByRole('dialog', { name: 'Rehearsal video' }).waitFor({ state: 'hidden' });

  async function appearance(theme, scale) {
    await button(page, 'Project menu').click();
    await button(page, 'Preferences').click();
    await select(page, 'Interface theme').selectOption(theme);
    await select(page, 'UI scale').selectOption(scale);
    await page.keyboard.press('Escape');
  }

  await button(page, '2D field').click();
  await appearance('light', '1');
  await open();
  await button(modal, 'Edit prop').click();
  await screenshot('light');
  await close();
  await page.setViewportSize({ width: 940, height: 650 });
  await appearance('high-contrast', '1.5');
  await open();
  await button(modal, 'Edit prop').click();
  await screenshot('high-contrast-150');
  await button(modal, 'Apply prop').scrollIntoViewIfNeeded();
  await button(modal, 'Cancel').click();
  await button(modal, 'Remove prop…').click();
  await page.getByRole('alertdialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal(await select(modal, 'Prop').locator('option').count(), 2);
  await button(modal, 'Remove prop…').click();
  await button(page.getByRole('alertdialog'), 'Remove prop').click();
  await page.waitForFunction(() => document.querySelector('.staging-chooser select')?.options.length === 1);
  await close();
  assert.equal(await prop('Platform').count(), 0);
  await button(page, 'Undo').click();
  assert.equal(await prop('Platform').count(), 1);
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
    console.log('Staging replay passed placement, independent selection, timing, visibility, undo, save/reopen and video export.');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
