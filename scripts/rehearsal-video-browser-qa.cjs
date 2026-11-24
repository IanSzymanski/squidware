// Start a production preview and make Playwright, Chromium, FFmpeg, and ffprobe available.
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { PerspectiveCamera, Vector3 } = require('three');
const output = path.resolve(process.env.SQUIDWARE_VIDEO_OUTPUT ?? '.qa/rehearsal-video');
const url = process.env.SQUIDWARE_VIDEO_URL ?? 'http://127.0.0.1:4173/';

function wav() {
  const rate = 48000;
  const samples = rate * 4;
  const file = Buffer.alloc(44 + samples * 2);
  file.write('RIFF'); file.writeUInt32LE(file.length - 8, 4); file.write('WAVEfmt ', 8);
  file.writeUInt32LE(16, 16); file.writeUInt16LE(1, 20); file.writeUInt16LE(1, 22);
  file.writeUInt32LE(rate, 24); file.writeUInt32LE(rate * 2, 28);
  file.writeUInt16LE(2, 32); file.writeUInt16LE(16, 34);
  file.write('data', 36); file.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) file.writeInt16LE(Math.round(8000 * Math.sin(i / rate * Math.PI * 880)), 44 + i * 2);
  return file;
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
const select = (page, name) => page.getByRole('combobox', { name, exact: true });
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));

(async () => {
  await fs.mkdir(output, { recursive: true });
  const base = JSON.parse(await fs.readFile('format/examples/basic-v2.squid', 'utf8'));
  const project = { ...base, id: 'rehearsal-video-qa', audioOffsetSeconds: -.25, moves: base.moves.map(move => ({ ...move, counts: 4, tempo: 120 })) };
  project.sections[0].color = '#ff2020';
  for (const move of project.moves) {
    move.transition = 'linear';
    move.paths = {};
  }
  const fixture = path.join(output, 'production.squid');
  await fs.writeFile(fixture, JSON.stringify(project));
  const browser = await chromium.launch({ executablePath: process.env.SQUIDWARE_CHROMIUM, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(url);
    await page.locator('input[accept=".squid,.json"]').setInputFiles(fixture);
    await page.waitForFunction(title => document.querySelector('.project-title')?.textContent.trim() === title, project.title);
    await button(page, 'Switch workspace').click();
    await button(page, 'Review workspace').click();
    await select(page, 'Review camera').selectOption('front');
    const canvas = page.locator('.field-viewports__preview canvas');
    await page.screenshot({ path: path.join(output, 'review.png') });
    await canvas.hover();
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(250);
    await button(page, 'Saved camera views').click();
    await page.getByRole('textbox', { name: 'View name' }).fill('Sideline close-up');
    await page.screenshot({ path: path.join(output, 'saved-views.png') });
    await button(page, 'Save current angle').click();
    await page.getByRole('dialog', { name: 'Saved camera views' }).waitFor({ state: 'hidden' });
    await button(page, 'Undo').click();
    await button(page, 'Saved camera views').click();
    assert.deepEqual(await select(page, 'Camera view').locator('option').allTextContents(), ['Current angle · new view']);
    await page.keyboard.press('Escape');
    await button(page, 'Redo').click();
    await button(page, 'Saved camera views').click();
    await select(page, 'Camera view').selectOption({ label: 'Sideline close-up' });
    await button(page, 'Use view').click();
    assert.equal(await select(page, 'Review camera').locator('option:checked').textContent(), 'Sideline close-up');
    const projectDownload = page.waitForEvent('download');
    await button(page, 'Save').click();
    const saved = path.join(output, 'saved-camera.squid');
    await (await projectDownload).saveAs(saved);
    const data = JSON.parse(await fs.readFile(saved, 'utf8'));
    assert.equal(data.schemaVersion, 17);
    assert.equal(data.cameraViews[0].name, 'Sideline close-up');
    await page.locator('input[accept=".squid,.json"]').setInputFiles(saved);
    await button(page, 'Saved camera views').click();
    await select(page, 'Camera view').selectOption({ label: 'Sideline close-up' });
    await button(page, 'Use view').click();
    const sound = path.join(output, 'tone.wav');
    await fs.writeFile(sound, wav());
    await page.locator('input[accept="audio/*"]').setInputFiles(sound);
    await page.waitForFunction(() => document.querySelector('audio')?.src.startsWith('blob:'));
    console.log('Camera saved, exported as v17, reopened and restored');
    async function openExport(canRender = true) {
      await button(page, 'Export').click();
      await button(page, 'Rehearsal video…').click();
      await page.getByRole('dialog', { name: 'Rehearsal video' }).waitFor();
      await button(page, 'Render video').waitFor();
      assert.equal(await button(page, 'Render video').isEnabled(), canRender);
    }
    async function exportVideo(name, includeAudio) {
      await openExport();
      await select(page, 'End set').selectOption('1');
      await select(page, 'Camera view').selectOption({ label: 'Sideline close-up' });
      await select(page, 'Resolution').selectOption('480p');
      await select(page, 'Frame rate').selectOption('15');
      const audio = page.getByRole('checkbox', { name: 'Include attached recording' });
      assert.equal(await audio.isChecked(), false);
      if (includeAudio) {
        await audio.check();
        await select(page, 'Rendering quality').selectOption('detailed');
        await page.screenshot({ path: path.join(output, 'export-options.png') });
      }
      await button(page, 'Render video').click();
      await page.waitForFunction(() => document.querySelector('dialog[open] [role=alert]') || [...document.querySelectorAll('dialog[open] button')].some(b => b.textContent === 'Save WebM'), undefined, { timeout: 120000 });
      const error = await page.locator('dialog[open] [role=alert]').allTextContents();
      assert.deepEqual(error, []);
      const pending = page.waitForEvent('download');
      await button(page, 'Save WebM').click();
      const file = path.join(output, name);
      await (await pending).saveAs(file);
      const result = probe(file);
      assert.equal(result.streams[0].codec_name, 'vp8');
      assert.equal(result.streams[0].width, 854);
      assert.equal(result.streams[0].height, 480);
      assert.equal(result.streams[0].nb_read_frames, '31');
      assert.equal(result.format.tags.title ?? result.format.tags["MOVIE/TITLE"], project.title);
      return result;
    }
    const silent = await exportVideo('silent.webm', false);
    assert.equal(silent.streams.length, 1);
    const { fov, position, target } = data.cameraViews[0];
    const camera = new PerspectiveCamera(fov, 854 / 480, .1, 500);
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateMatrixWorld();
    for (const frame of [0, 15, 30]) {
      const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(output, 'silent.webm'), '-vf', `select=eq(n\\,${frame})`,
        '-frames:v', '1', '-threads', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 2 * 1024 * 1024 });
      const progress = frame / 30;
      const z = 10 + progress * 10 - project.field.height / 2;
      const projected = [10, 20].map(start => {
        const x = start + progress * 20 - project.field.width / 2;
        return (new Vector3(x, 1.3, z).project(camera).x + 1) * 427;
      });
      const split = (projected[0] + projected[1]) / 2;
      const found = [{ x: 0, count: 0 }, { x: 0, count: 0 }];
      for (let pixel = 0; pixel < raw.length / 3; pixel++) {
        const offset = pixel * 3;
        const r = raw[offset], g = raw[offset + 1], b = raw[offset + 2];
        if (r < 105 || r < g * 1.5 || r < b * 1.5) continue;
        const x = pixel % 854;
        const marker = found[x < split ? 0 : 1];
        marker.x += x;
        marker.count++;
      }
      for (const [index, marker] of found.entries()) {
        assert.ok(marker.count >= 3, `expected performer ${index + 1} in frame ${frame}`);
        assert.ok(Math.abs(marker.x / marker.count - projected[index]) <= 4, `frame ${frame}: performer ${index + 1} at ${marker.x / marker.count} versus ${projected[index]}`);
      }
    }
    console.log('Silent export', silent.format.duration, 'seconds, with matching opening, midpoint, and final positions');
    const withAudio = await exportVideo('with-audio.webm', true);
    assert.equal(withAudio.streams[1].codec_name, 'opus');
    assert.ok(Math.abs(Number(withAudio.streams[1].start_time) - .25) < .035, JSON.stringify(withAudio.streams[1]));
    console.log('Audio export', withAudio.streams[1].start_time, 'seconds offset');
    await openExport();
    await button(page, 'Render video').click();
    await button(page, 'Cancel export').click();
    await page.getByText('Video export canceled.').waitFor();
    await page.evaluate(() => { VideoEncoder.isConfigSupported = async () => ({ supported: false }); });
    await select(page, 'Resolution').selectOption('1080p');
    await select(page, 'Frame rate').selectOption('30');
    await button(page, 'Render video').click();
    await page.getByText(/cannot encode WebM with these settings/).waitFor();

    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 980, height: 680 });
    await button(page, 'Project menu').click();
    await button(page, 'Preferences').click();
    await select(page, 'Interface theme').selectOption('high-contrast');
    await select(page, 'UI scale').selectOption('1.5');
    await page.keyboard.press('Escape');
    await openExport();
    await button(page, 'Render video').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'export-compact.png') });
    await page.keyboard.press('Escape');

    const longPath = path.join(output, 'long-production.squid');
    const longProject = { ...project, id: 'long-rehearsal-video-qa', title: 'Long rehearsal',
      moves: project.moves.map(move => ({ ...move, counts: 128 })) };
    await fs.writeFile(longPath, JSON.stringify(longProject));
    await page.locator('input[accept=".squid,.json"]').setInputFiles(longPath);
    await page.waitForFunction(() => document.querySelector('.project-title')?.textContent.trim() === 'Long rehearsal');
    await openExport(false);
    await page.getByText(/Choose up to 120 seconds/).waitFor();
    await select(page, 'End set').selectOption('1');
    assert.equal(await button(page, 'Render video').isEnabled(), true);
    await page.evaluate(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind.startsWith('webgl') ? null : getContext.call(this, kind, ...args);
      };
    });
    await button(page, 'Render video').click();
    await page.getByText(/The 3D scene could not render/).waitFor();
    assert.deepEqual(errors, []);
    console.log('Cancellation, unsupported encoder, 120-second limit and WebGL fallback verified');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
