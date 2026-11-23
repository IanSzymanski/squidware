// Run against the development example with an optional local Playwright installation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const output = path.resolve(process.env.SQUIDWARE_LEG_OUTPUT ?? '.qa/leg-motion');
const url = process.env.SQUIDWARE_LEG_URL ?? 'http://127.0.0.1:5173/examples/leg-motion/';
const fullscreen = { width: 1366, height: 768 };
const scenarios = ['hold', 'forward', 'mark', 'backward', 'lateral'];
const views = ['front', 'side', 'press'];
const notes = { interactions: [], benchmarks: [] };

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.SQUIDWARE_CHROMIUM, headless: true,
    args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: fullscreen });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const performance = await page.context().newCDPSession(page);
    await performance.send('Performance.enable');
    await page.goto(url);
    const canvas = page.getByRole('img', { name: /Three dimensional drill preview/ });
    const scenario = page.getByRole('combobox', { name: 'Motion', exact: true });
    const cast = page.getByRole('combobox', { name: 'Cast', exact: true });
    const view = page.getByRole('combobox', { name: 'Camera view', exact: true });
    const animate = page.getByRole('checkbox', { name: 'Animate legs' });
    const count = page.getByRole('slider', { name: 'Count' });
    const readout = page.locator('output');
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    const play = page.getByRole('button', { name: 'Play', exact: true });
    const loop = page.getByRole('checkbox', { name: 'Loop' });
    const speed = page.getByRole('combobox', { name: 'Speed', exact: true });
    await canvas.waitFor();
    async function settle() {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    }
    async function seek(value) {
      await count.fill(String(value));
      await settle();
      assert.equal(Number(await readout.innerText()), value, 'requested count is displayed');
    }
    async function saveCanvas(name) {
      await settle();
      return canvas.screenshot({ path: path.join(output, name + '.png') });
    }
    await page.locator('h1').hover();
    await settle();
    notes.fieldHeight = await page.locator('.leg-motion-example__stage').evaluate(element => element.clientHeight);
    assert.ok(notes.fieldHeight >= 470);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), fullscreen.height);
    await page.screenshot({ path: path.join(output, 'desktop-animated.png') });
    await animate.focus();
    await page.keyboard.press('Space');
    assert.equal(await animate.isChecked(), false);
    await page.locator('h1').hover();
    await settle();
    await page.screenshot({ path: path.join(output, 'desktop-static.png') });
    let staticPose = await canvas.screenshot();
    await animate.focus();
    await page.keyboard.press('Space');
    await settle();
    assert.equal(await animate.isChecked(), true);
    assert.notDeepEqual(await canvas.screenshot(), staticPose);
    notes.interactions.push('Keyboard Space switches to standard markers and restores articulation with a pixel change.');

    for (const clip of scenarios) {
      await scenario.selectOption(clip);
      for (const angle of views) {
        await view.selectOption(angle);
        for (const beat of [3.25, 4.25]) {
          await seek(beat);
          await saveCanvas(clip + '-' + angle + '-' + beat);
        }
      }
    }

    await scenario.selectOption('hold');
    await view.selectOption('side');
    await seek(3.25);
    const held = await canvas.screenshot();
    await seek(4.25);
    assert.deepEqual(await canvas.screenshot(), held);
    await scenario.selectOption('mark');
    const markFirst = await canvas.screenshot();
    await seek(3.25);
    assert.notDeepEqual(await canvas.screenshot(), markFirst);
    notes.interactions.push('Neutral hold is pixel-identical across counts. Explicit mark time alternates with the performer root held in place.');

    await scenario.selectOption('forward');
    await view.selectOption('side');
    await seek(4);
    const atFour = await canvas.screenshot();
    await play.click();
    await page.waitForFunction(() => Number(document.querySelector('output').textContent) > 4.25);
    await pause.click();
    const frozen = await readout.innerText();
    await settle();
    const pixelsFrozen = await canvas.screenshot();
    await page.waitForTimeout(300);
    assert.equal(await readout.innerText(), frozen);
    assert.deepEqual(await canvas.screenshot(), pixelsFrozen);
    await seek(4);
    assert.deepEqual(await canvas.screenshot(), atFour);
    await seek(7.75);
    await speed.selectOption('2');
    await play.click();
    await page.waitForFunction(() => Number(document.querySelector('output').textContent) < 2);
    await pause.click();
    await seek(4);
    assert.deepEqual(await canvas.screenshot(), atFour);
    await loop.uncheck();
    await seek(7.75);
    await play.click();
    await page.waitForFunction(() => Number(document.querySelector('output').textContent) === 8);
    await play.waitFor();
    await loop.check();
    notes.interactions.push('Playback advances, pause freezes count and canvas, 2× loops at the boundary, non-looping playback stops at 8, and rescrubbing to count 4 reproduces the exact render.');

    for (const theme of ['light', 'high-contrast']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.setViewportSize({ width: 650, height: 900 });
      await page.evaluate(() => { document.documentElement.style.fontSize = '18px'; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 650);
      await scenario.selectOption('mark');
      await count.focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      assert.equal(await readout.innerText(), '0.13');
      await page.locator('h1').hover();
      await settle();
      await page.screenshot({ path: path.join(output, 'compact-' + theme + '.png') });
    }
    notes.interactions.push('Motion and count remain keyboard-accessible at 650px width and 18px root text in light and high-contrast themes.');

    await page.evaluate(() => { delete document.documentElement.dataset.theme; document.documentElement.style.fontSize = ''; });
    await page.setViewportSize(fullscreen);
    await view.selectOption('ensemble');
    await cast.selectOption('500');
    await scenario.selectOption('forward');
    await speed.selectOption('1');
    await seek(4);
    await saveCanvas('ensemble-500');
    notes.backend = await page.evaluate(() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      const debug = probe.getExtension('WEBGL_debug_renderer_info');
      return { userAgent: navigator.userAgent, renderer: probe.getParameter(debug.UNMASKED_RENDERER_WEBGL), vendor: probe.getParameter(debug.UNMASKED_VENDOR_WEBGL) };
    });
    if (process.argv.includes('--measure')) {
      function summarize(samples) {
        const values = samples.sort((a, b) => a - b);
        return { samples: values.length, median: +values[Math.floor(values.length * .5)].toFixed(2), p95: +values[Math.floor(values.length * .95)].toFixed(2) };
      }
      for (const performers of [64, 500]) {
        await cast.selectOption(String(performers));
        for (const animated of [false, true]) {
          await animate.setChecked(animated);
          await seek(0);
          await play.click();
          await page.waitForTimeout(850);
          const before = await performance.send('Performance.getMetrics');
          const samples = await page.evaluate(() => new Promise(resolve => {
            const intervals = [];
            const updates = [];
            let previous = performance.now();
            const started = previous;
            let lastUpdate = previous;
            const count = document.querySelector('output');
            const observer = new MutationObserver(() => {
              const now = performance.now();
              updates.push(now - lastUpdate);
              lastUpdate = now;
            });
            observer.observe(count, { subtree: true, characterData: true, childList: true });
            function tick(now) {
              if (now >= previous) intervals.push(now - previous);
              previous = now;
              if (now - started < 4500) requestAnimationFrame(tick);
              else { observer.disconnect(); resolve({ intervals, updates }); }
            }
            requestAnimationFrame(tick);
          }));
          const after = await performance.send('Performance.getMetrics');
          await pause.click();
          const metric = (snapshot, name) => snapshot.metrics.find(entry => entry.name === name).value;
          const scriptMs = (metric(after, 'ScriptDuration') - metric(before, 'ScriptDuration')) * 1000;
          const durationMs = (metric(after, 'Timestamp') - metric(before, 'Timestamp')) * 1000;
          assert.ok(samples.updates.length > 2, `expected changing counts with ${performers} performers (animated: ${animated})`);
          notes.benchmarks.push({ performers, animated, animationFrameMs: summarize(samples.intervals.slice(1)), countUpdateMs: summarize(samples.updates.slice(1)), mainThreadScriptMsPerSecond: +(scriptMs * 1000 / durationMs).toFixed(1) });
        }
      }
    }
    assert.deepEqual(errors, []);
    const report = JSON.stringify(notes, null, 2) + '\n';
    await fs.writeFile(path.join(output, 'report.json'), report);
    process.stdout.write(report);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
