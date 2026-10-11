// Render the real application print templates with the demo project, then use
// a hidden sandboxed Electron window to exercise Chromium's PDF pagination.
// Usage: node scripts/print-qa.mjs [absolute-output-directory]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = process.argv[2] || path.join(root, '.qa', 'print');
if (!path.isAbsolute(output)) throw new Error('The print QA output directory must be an absolute path.');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'squidware-print-qa-'));
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(temporary, 'render-fixtures.cjs');
await fs.mkdir(output, { recursive: true });

await esbuild.build({
  stdin: {
    contents: `
      import { createElement } from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { PrintOutput } from './src/components/PrintOutput';
      import { createDemoProject } from './src/domain';
      const project = createDemoProject();
      export const fixtures = ['charts', 'coordinates'].map(mode => ({
        mode,
        expectedPages: mode === 'charts' ? project.sets.length : project.performers.length,
        markup: renderToStaticMarkup(createElement(PrintOutput, { project, mode })),
      }));
    `,
    loader: 'tsx', resolveDir: root,
  },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

const { fixtures } = require(bundle);
const [stylesheet, stageStyles] = await Promise.all([
  fs.readFile(path.join(root, 'src', 'styles.css'), 'utf8'),
  fs.readFile(path.join(root, 'src', 'components', 'stages.css'), 'utf8'),
]);
const styles = stylesheet.replace(/@import\s+['"]\.\/components\/stages\.css['"]\s*;/, stageStyles);
const files = [];
for (const fixture of fixtures) {
  const htmlPath = path.join(output, `${fixture.mode}.html`);
  const pdfPath = path.join(output, `${fixture.mode}.pdf`);
  const document = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>Squidware print QA — ${fixture.mode}</title><style>${styles}</style></head><body>${fixture.markup}</body></html>`;
  await fs.writeFile(htmlPath, document, 'utf8');
  files.push({ mode: fixture.mode, expectedPages: fixture.expectedPages, htmlPath, pdfPath });
}

const manifestPath = path.join(output, 'manifest.json');
await fs.writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), fixtures: files }, null, 2)}\n`);
const runner = path.join(temporary, 'print-runner.cjs');
await fs.mkdir(path.join(temporary, 'profile'), { recursive: true });
await fs.writeFile(runner, `
'use strict';
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const manifestPath = process.argv.find(value => value.startsWith('--print-qa-manifest=')).slice('--print-qa-manifest='.length);
app.setPath('userData', path.join(__dirname, 'profile'));
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => { console.error('Print QA timed out.'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  for (const fixture of manifest.fixtures) {
    const expectedUrl = pathToFileURL(fixture.htmlPath).href;
    const window = new BrowserWindow({ show: false, width: 1400, height: 1000,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== expectedUrl) event.preventDefault(); });
    await window.loadURL(expectedUrl);
    const state = await window.webContents.executeJavaScript("document.fonts.ready.then(() => ({ sections: document.querySelectorAll('#print-output > .print-page').length, charts: document.querySelectorAll('.print-page > svg').length, tables: document.querySelectorAll('.performer-page table').length, node: typeof window.require }))");
    if (state.sections !== fixture.expectedPages || state.node !== 'undefined') throw new Error('Unexpected print fixture: ' + JSON.stringify(state));
    const pdf = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'Letter', margins: { top: 0.35, bottom: 0.35, left: 0.35, right: 0.35 } });
    await fs.writeFile(fixture.pdfPath, pdf);
    fixture.renderedSections = state.sections;
    fixture.pdfBytes = pdf.length;
    window.destroy();
    console.log('Rendered ' + fixture.mode + ': ' + state.sections + ' sections, ' + pdf.length + ' PDF bytes');
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\\n');
  clearTimeout(timeout);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
`);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const electron = spawn(require('electron'), [runner, `--print-qa-manifest=${manifestPath}`], {
  cwd: root, env, stdio: 'inherit', shell: false, windowsHide: true,
});
const exitCode = await new Promise((resolve, reject) => {
  electron.once('error', reject);
  electron.once('exit', code => resolve(code ?? 1));
});
if (exitCode !== 0) throw new Error(`Electron print QA failed with exit code ${exitCode}.`);
console.log(`Print QA artifacts: ${output}`);
