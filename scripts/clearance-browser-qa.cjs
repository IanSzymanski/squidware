// Serve the built app and point Playwright at an installed Chromium.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.env.SQUIDWARE_CLEARANCE_URL ?? 'http://127.0.0.1:4173/';
const beforeUrl = process.env.SQUIDWARE_CLEARANCE_BEFORE_URL;
const output = path.resolve(process.env.SQUIDWARE_CLEARANCE_OUTPUT ?? '.qa/clearance');
const button = (page, name) => page.getByRole('button', { name, exact: true });
const combo = (page, name) => page.getByRole('combobox', { name, exact: true });
const modal = (page, name) => page.getByRole('dialog', { name, exact: true });
async function shot(page, name) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}

async function load(page, project) {
  await page.locator('input[accept=".squid,.json"]').setInputFiles({
    name: `${project.id}.squid`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.waitForFunction(title => document.querySelector('.project-title')?.textContent.trim() === title, project.title);
}

async function openProblems(page) {
  await page.locator('.problem-count-badge').click();
  const dialog = modal(page, 'Show-wide problems');
  await dialog.locator('[data-show-analysis-status=ready]').waitFor();
  return dialog;
}

async function openRules(page) {
  const problems = await openProblems(page);
  await button(problems, 'Analysis rules').click();
  const rules = modal(page, 'Analysis rules');
  await rules.waitFor();
  return rules;
}

async function openProps(page) {
  const toolbar = page.getByRole('toolbar', { name: 'Field tools' });
  const direct = button(toolbar, 'Staging props');
  if (await direct.isVisible()) await direct.click();
  else {
    await button(toolbar, 'More field tools').click();
    await toolbar.getByRole('menuitem', { name: 'Staging props', exact: true }).click();
  }
  return modal(page, 'Staging props');
}

async function review(page, project) {
  const { clearanceRules, ...unconfigured } = project;
  if (beforeUrl) {
    await page.goto(beforeUrl);
    await load(page, { ...unconfigured, schemaVersion: 18, stagingObjects: project.stagingObjects.map(({ footprint, ...prop }) => prop) });
    await openRules(page);
    await shot(page, 'before-rules');
  }
  await page.goto(url);
  await load(page, unconfigured);
  let rules = await openRules(page);
  const disclosure = rules.getByText('Footprint clearance', { exact: true });
  await disclosure.focus();
  await page.keyboard.press('Space');
  const enabled = rules.getByRole('checkbox', { name: 'Check clearance with props' });
  await enabled.check();
  const gap = rules.getByRole('spinbutton', { name: 'Required edge gap · yards' });
  await gap.fill('6');
  await rules.getByRole('alert').filter({ hasText: 'Enter a gap from 0 to 5 yards' }).waitFor();
  assert.equal(await button(rules, 'Save rules').getAttribute('aria-disabled'), 'true');
  await gap.fill(String(clearanceRules.minimumGap));
  const rulesBounds = await button(rules, 'Save rules').boundingBox();
  assert.ok(rulesBounds.y >= 0 && rulesBounds.y + rulesBounds.height <= 768, JSON.stringify(rulesBounds));
  await shot(page, 'rules');
  await button(rules, 'Save rules').focus();
  await page.keyboard.press('Enter');
  await rules.waitFor({ state: 'hidden' });

  let problems = await openProblems(page);
  await combo(problems, 'Problem type').selectOption('clearance');
  const platform = problems.getByRole('button', { name: /Go to problem.*A1.*Platform/ });
  const speaker = problems.getByRole('button', { name: /Go to problem.*Scenic panel.*Speaker/ });
  await platform.waitFor();
  await speaker.waitFor();
  assert.match(await platform.textContent(), /Show 8 · Move 8/);
  assert.match(await speaker.textContent(), /circle Ø0\.6 yd/);
  assert.match(await speaker.textContent(), /Warning.*edge gap/);
  await shot(page, 'findings');
  await platform.focus();
  await page.keyboard.press('Enter');
  await page.locator('.clearance-outline[data-problem-performer=a]').waitFor();
  await page.locator('.clearance-outline[data-problem-prop=arc-prop]').waitFor();
  const fieldHeight = await page.locator('.field-container').evaluate(element => element.getBoundingClientRect().height);
  assert.ok(fieldHeight >= 470, `Field height ${fieldHeight}`);
  await shot(page, 'performer-prop');

  problems = await openProblems(page);
  await problems.getByRole('textbox', { name: 'Find a problem' }).fill('stand');
  await speaker.click();
  await page.locator('.clearance-outline[data-problem-prop=deck]').waitFor();
  assert.equal(await page.locator('.clearance-outline[data-problem-performer]').count(), 0);
  await page.locator('.clearance-outline[data-problem-prop=stand] circle').waitFor();
  await shot(page, 'prop-pair');

  await button(page, 'First set').click();
  const props = await openProps(page);
  await combo(props, 'Prop').selectOption('arc-prop');
  await button(props, 'Edit prop').click();
  await combo(props, 'Planning footprint').selectOption('circle');
  await props.locator('[data-staging-id=arc-prop] circle').waitFor();
  await props.getByRole('checkbox', { name: 'Visible at this set' }).uncheck();
  await button(props, 'Apply prop').click();
  await combo(props, 'Prop').waitFor();
  await page.keyboard.press('Escape');
  problems = await openProblems(page);
  await combo(problems, 'Problem type').selectOption('clearance');
  await problems.getByText('1–1 of 1 matching findings', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await button(page, 'Undo').click();
  problems = await openProblems(page);
  await combo(problems, 'Problem type').selectOption('clearance');
  await platform.waitFor();
  await page.keyboard.press('Escape');

  const pendingDownload = page.waitForEvent('download');
  await button(page, 'Save').click();
  const filename = path.join(output, 'saved.squid');
  await (await pendingDownload).saveAs(filename);
  const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
  assert.equal(saved.schemaVersion, 20);
  assert.deepEqual(saved.clearanceRules, clearanceRules);
  assert.deepEqual(saved.sets, project.sets);
  assert.deepEqual(saved.stagingObjects, project.stagingObjects);
  await load(page, { ...saved, title: 'Reopened clearance example' });
  problems = await openProblems(page);
  await combo(problems, 'Problem type').selectOption('clearance');
  await platform.waitFor();
  await speaker.waitFor();
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 940, height: 650 });
  await button(page, 'Project menu').click();
  await button(page, 'Preferences').click();
  await combo(page, 'Interface theme').selectOption('high-contrast');
  await combo(page, 'UI scale').selectOption('1.5');
  await page.keyboard.press('Escape');
  rules = await openRules(page);
  await rules.getByRole('spinbutton', { name: 'Required edge gap · yards' }).fill('.3');
  await button(rules, 'Save rules').focus();
  const bounds = await button(rules, 'Save rules').boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 650, JSON.stringify(bounds));
  await shot(page, 'high-contrast-150');
  await page.keyboard.press('Escape');
  await rules.waitFor({ state: 'hidden' });
  await fs.writeFile(path.join(output, 'review.json'), JSON.stringify({ fieldHeight, viewport: [1366, 768], enlargedViewport: [940, 650] }, null, 2) + '\n');
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const project = JSON.parse(await fs.readFile('format/examples/clearance-v20.squid', 'utf8'));
  const browser = await chromium.launch({ executablePath: process.env.SQUIDWARE_CHROMIUM, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await review(page, project);
    assert.deepEqual(errors, []);
    console.log('Clearance replay passed rules, curved crossings, rotating prop pairs, editing, undo and save/reopen.');
  } catch (error) {
    await shot(page, 'failure').catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
