'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const mainSource = syncFs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preloadSource = syncFs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const project = syncFs.readFileSync(path.join(root, 'src/fixtures/schema-v2.squid'), 'utf8');
const legacyProject = syncFs.readFileSync(path.join(root, 'src/fixtures/schema-v1.squid'), 'utf8');

// Run the actual main-process handlers with controlled dialogs and real files.
// No Electron binary, GUI, remote server, or production user profile is needed.
async function harness(t, { failRename = false, development = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'squidware-desktop-test-'));
  t.after(async () => {
    const relative = path.relative(os.tmpdir(), directory);
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('squidware-desktop-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const handlers = new Map();
  const listeners = new Map();
  const messages = [];
  let window;
  let nextDialog = { canceled: true };
  let saveDialogs = 0;
  let menu;
  const sessionCallbacks = {};
  class FakeWindow {
    constructor(options) {
      window = this;
      this.options = options;
      this.events = new Map();
      this.webContents = {
        mainFrame: { url: development ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(root, 'dist', 'index.html')).href },
        on: () => {}, setWindowOpenHandler: handler => { this.openWindowHandler = handler; },
        send: (...args) => messages.push(args),
        printToPDF: async options => { messages.push(['printToPDF', options]); return Buffer.from('%PDF-test'); },
      };
    }
    on(event, callback) { this.events.set(event, callback); }
    once(event, callback) { this.events.set(event, callback); }
    isDestroyed() { return false; }
    loadURL() { return Promise.resolve(); }
    setDocumentEdited(value) { this.documentEdited = value; }
    close() { this.closed = true; }
  }
  const electron = {
    app: {
      isPackaged: !development, setName() {}, requestSingleInstanceLock: () => true, on() {}, getPath: () => directory,
      whenReady: () => ({ then: () => ({ catch() {} }) }),
    },
    BrowserWindow: FakeWindow,
    dialog: {
      showSaveDialog: async () => { saveDialogs += 1; return nextDialog; },
      showOpenDialog: async () => nextDialog,
      showMessageBox: async () => nextDialog,
    },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), on: (channel, handler) => listeners.set(channel, handler) },
    Menu: { buildFromTemplate: template => template, setApplicationMenu: template => { menu = template; } },
    session: { defaultSession: {
      setPermissionRequestHandler: handler => { sessionCallbacks.request = handler; },
      setPermissionCheckHandler: handler => { sessionCallbacks.check = handler; },
      on: () => {},
      webRequest: { onHeadersReceived: handler => { sessionCallbacks.headers = handler; } },
    } },
  };
  const context = {
    require: name => name === 'electron' ? electron
      : name === 'node:fs/promises' && failRename ? { ...fs, rename: async () => { throw new Error('Simulated disk failure'); } }
      : name.startsWith('./') ? require(path.join(root, 'electron', name)) : require(name),
    __dirname: path.join(root, 'electron'),
    process: { argv: [], env: development ? { ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/' } : {}, platform: 'win32' },
    Buffer, URL, console, setTimeout, clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(mainSource, context);
  context.registerIpc();
  context.createWindow();
  t.after(async () => { await vm.runInContext('recoveryService?.close()', context); });
  const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  return {
    directory, context, sender, window, messages, sessionCallbacks,
    dialog: value => { nextDialog = value; },
    saveDialogCount: () => saveDialogs,
    menu: () => { context.installMenu(); return menu; },
    invoke: (name, ...args) => handlers.get(`squidware:${name}`)(sender, ...args),
    invokeAs: (name, source, ...args) => handlers.get(`squidware:${name}`)(source, ...args),
    send: (name, value) => listeners.get(`squidware:${name}`)(sender, value),
  };
}

test('save writes complete JSON and subsequent saves reuse only the approved path', async t => {
  const h = await harness(t);
  const filename = path.join(h.directory, 'show.squid');
  h.dialog({ canceled: false, filePath: filename });
  assert.equal(await h.invoke('save-project', project, 'Show'), filename);
  const updated = project.replace('Test show', 'Updated show');
  assert.equal(await h.invoke('save-project', updated, 'Different suggested title'), filename);
  assert.equal(h.saveDialogCount(), 1);
  assert.equal(await fs.readFile(filename, 'utf8'), updated);
  assert.deepEqual(await fs.readdir(h.directory), ['show.squid']);
});

test('failed atomic replacement preserves the previous file and removes its temporary file', async t => {
  const h = await harness(t, { failRename: true });
  const filename = path.join(h.directory, 'show.squid');
  await fs.writeFile(filename, 'previous contents');
  h.dialog({ canceled: false, filePath: filename });
  await assert.rejects(h.invoke('save-project', project, 'Show'), /Simulated disk failure/);
  assert.equal(await fs.readFile(filename, 'utf8'), 'previous contents');
  assert.deepEqual(await fs.readdir(h.directory), ['show.squid']);
});

test('resetting a project forgets the destination, and canceling Save As preserves it', async t => {
  const h = await harness(t);
  const filename = path.join(h.directory, 'show.squid');
  h.dialog({ canceled: false, filePath: filename });
  await h.invoke('save-project', project, 'Show');
  h.dialog({ canceled: true });
  assert.equal(await h.invoke('save-project', project, 'Show', true), null);
  assert.equal(await h.invoke('save-project', project, 'Show'), filename);
  h.send('reset-project');
  assert.equal(await h.invoke('save-project', project, 'Show'), null);
  assert.equal(h.saveDialogCount(), 3);
});

test('open validates contents before changing the saved destination', async t => {
  const h = await harness(t);
  const filename = path.join(h.directory, 'show.squid');
  const invalid = path.join(h.directory, 'invalid.squid');
  await fs.writeFile(filename, project);
  await fs.writeFile(invalid, '{not json');
  h.dialog({ canceled: false, filePaths: [filename] });
  const result = await h.invoke('open-project');
  assert.equal(result.path, filename);
  assert.equal(result.content, project);
  h.dialog({ canceled: false, filePaths: [invalid] });
  await assert.rejects(h.invoke('open-project'), /valid JSON/);
  assert.equal(await h.invoke('save-project', project, 'Show'), filename);
  assert.equal(h.saveDialogCount(), 0);
});

test('JSON imports require a new Squidware destination instead of overwriting the import', async t => {
  const h = await harness(t);
  const filename = path.join(h.directory, 'import.json');
  await fs.writeFile(filename, project);
  h.dialog({ canceled: false, filePaths: [filename] });
  await h.invoke('open-project');
  h.dialog({ canceled: true });
  assert.equal(await h.invoke('save-project', project, 'Show'), null);
  assert.equal(h.saveDialogCount(), 1);
  assert.equal(await fs.readFile(filename, 'utf8'), project);
});

test('native open accepts v1 and v2, and rejects dangling or future files without changing the save destination', async t => {
  const h = await harness(t);
  const filename = path.join(h.directory, 'legacy.squid');
  await fs.writeFile(filename, '\uFEFF' + legacyProject);
  h.dialog({ canceled: false, filePaths: [filename] });
  assert.equal((await h.invoke('open-project')).content, '\uFEFF' + legacyProject);
  const bad = path.join(h.directory, 'bad.squid');
  const dangling = JSON.parse(project);
  dangling.moves[0].toSetId = 'missing';
  for (const [content, error] of [[JSON.stringify(dangling), /adjacent sets/], [JSON.stringify({ schemaVersion: 3 }), /Update Squidware/]]) {
    await fs.writeFile(bad, content);
    h.dialog({ canceled: false, filePaths: [bad] });
    await assert.rejects(h.invoke('open-project'), error);
    assert.equal(await h.invoke('save-project', project, 'Show'), filename);
    assert.equal(await fs.readFile(bad, 'utf8'), content);
  }
  assert.equal(h.saveDialogCount(), 0);
  assert.equal(JSON.parse(await fs.readFile(filename, 'utf8')).schemaVersion, 2);
});

test('native save rejects unsupported path geometry before any dialog or file write', async t => {
  const h = await harness(t);
  const data = JSON.parse(project);
  data.moves[0].paths.a = { segments: [{ id: 'curve', kind: 'curve', startCount: 0, endCount: 16 }] };
  await assert.rejects(h.invoke('save-project', JSON.stringify(data), 'Show'), /Update Squidware/);
  assert.equal(h.saveDialogCount(), 0);
  assert.deepEqual(await fs.readdir(h.directory), []);
});

test('canceled file and PDF dialogs return null', async t => {
  const h = await harness(t);
  for (const [operation, args] of [['open-project', []], ['save-project', [project, 'Show']], ['export-file', ['id,x,y', 'Coordinates', 'csv']], ['export-pdf', []]]) {
    assert.equal(await h.invoke(operation, ...args), null);
  }
  assert.deepEqual(await fs.readdir(h.directory), []);
});

test('unexpected formats, malformed project data, unsafe basenames and oversized payloads fail before dialogs', async t => {
  const h = await harness(t);
  for (const filename of ['../escape', 'path\\escape', 'CON', 'NUL.squid', 'name.', 'name ', 'a:b', '']) {
    await assert.rejects(h.invoke('save-project', project, filename), /plain filename/);
  }
  await assert.rejects(h.invoke('save-project', '{}', 'Show'), /supported/);
  await assert.rejects(h.invoke('save-project', project, 'Show', 'yes'), /Save As/);
  await assert.rejects(h.invoke('save-project', 'x'.repeat(10 * 1024 * 1024 + 1), 'Show'), /smaller/);
  await assert.rejects(h.invoke('export-file', 'x', 'Export', 'exe'), /Unsupported/);
  await assert.rejects(h.invoke('export-file', 'x'.repeat(20 * 1024 * 1024 + 1), 'Export', 'csv'), /smaller/);
  assert.equal(h.saveDialogCount(), 0);
});

test('untrusted senders, child frames and navigated main frames cannot invoke native operations', async t => {
  const h = await harness(t);
  await assert.rejects(h.invokeAs('save-project', { sender: {}, senderFrame: h.sender.senderFrame }, project, 'Show'), /untrusted/);
  await assert.rejects(h.invokeAs('save-project', { sender: h.sender.sender, senderFrame: { url: h.sender.senderFrame.url } }, project, 'Show'), /untrusted/);
  h.sender.senderFrame.url = 'https://example.com/';
  await assert.rejects(h.invoke('open-project'), /untrusted/);
  assert.equal(h.saveDialogCount(), 0);
});

test('appended file extensions do not silently overwrite an existing destination', async t => {
  const h = await harness(t);
  const filename = path.join(h.directory, 'Coordinates.csv');
  await fs.writeFile(filename, 'existing');
  h.dialog({ canceled: false, filePath: path.join(h.directory, 'Coordinates'), response: 0 });
  assert.equal(await h.invoke('export-file', 'replacement', 'Coordinates', 'csv'), null);
  assert.equal(await fs.readFile(filename, 'utf8'), 'existing');
  h.dialog({ canceled: false, filePath: path.join(h.directory, 'Coordinates'), response: 1 });
  assert.equal(await h.invoke('export-file', 'replacement', 'Coordinates', 'csv'), filename);
  assert.equal(await fs.readFile(filename, 'utf8'), 'replacement');
});

test('desktop windows isolate Node, reject popups, and receive dirty state', async t => {
  const h = await harness(t);
  assert.equal(h.window.options.show, false);
  const preferences = h.window.options.webPreferences;
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(h.window.openWindowHandler().action, 'deny');
  h.send('set-dirty', true);
  assert.equal(h.window.documentEdited, true);
  h.send('set-dirty', 'invalid');
  assert.equal(h.window.documentEdited, true);
  h.send('set-dirty', false);
  assert.equal(h.window.documentEdited, false);
});

test('unsaved close guard respects cancel and explicit discard', async t => {
  const h = await harness(t);
  h.send('set-dirty', true);
  let prevented = 0;
  h.dialog({ response: 0 });
  h.window.events.get('close')({ preventDefault: () => { prevented += 1; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, 1);
  assert.equal(h.window.closed, undefined);
  h.dialog({ response: 1 });
  h.window.events.get('close')({ preventDefault: () => { prevented += 1; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, 2);
  assert.equal(h.window.closed, true);
});

test('native menu routes select-all and both redo shortcuts to the renderer', async t => {
  const h = await harness(t);
  const edit = h.menu().find(item => item.label === '&Edit').submenu;
  const selectAll = edit.find(item => item.accelerator === 'CmdOrCtrl+A');
  const redo = edit.find(item => item.accelerator === 'CmdOrCtrl+Shift+Z');
  const windowsRedo = edit.find(item => item.accelerator === 'Ctrl+Y');
  selectAll.click(); redo.click(); windowsRedo.click();
  assert.deepEqual(h.messages.map(message => [...message]), [['squidware:menu-action', 'select-all'], ['squidware:menu-action', 'redo'], ['squidware:menu-action', 'redo']]);
});

test('production CSP rejects inline scripts and network connections while dev permits only its nonce', async t => {
  for (const development of [false, true]) {
    const h = await harness(t, { development });
    h.context.installSecurity();
    let headers;
    h.sessionCallbacks.headers({ responseHeaders: { 'content-security-policy': ['unsafe previous value'] } }, result => { headers = result.responseHeaders; });
    const csp = headers['Content-Security-Policy'][0];
    assert.equal(headers['content-security-policy'], undefined);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-src 'none'/);
    assert.equal(h.sessionCallbacks.check(), false);
    h.sessionCallbacks.request(null, 'camera', allowed => assert.equal(allowed, false));
    if (development) assert.match(csp, /script-src 'self' 'nonce-squidware-dev'/);
    else { assert.match(csp, /script-src 'self';/); assert.match(csp, /connect-src 'none'/); assert.doesNotMatch(csp, /nonce-/); }
  }
});

test('preload exposes only fixed methods and strips Electron event objects from allowlisted menu callbacks', () => {
  let bridge;
  let listener;
  let removed = false;
  const invocations = [];
  const context = {
    process: { platform: 'win32' },
    require: () => ({
      contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'squidware'); bridge = value; } },
      ipcRenderer: {
        invoke: (...args) => { invocations.push(args); return Promise.resolve(null); },
        send: (...args) => invocations.push(args),
        on: (_channel, callback) => { listener = callback; },
        removeListener: (_channel, callback) => { removed = callback === listener; },
      },
    }),
  };
  vm.runInNewContext(preloadSource, context);
  assert.ok(Object.isFrozen(bridge));
  assert.equal(bridge.invoke, undefined);
  assert.equal(bridge.ipcRenderer, undefined);
  const actions = [];
  const stop = bridge.onMenuAction((...args) => actions.push(args));
  listener({ secret: 'native event' }, 'select-all');
  listener({ secret: 'native event' }, 'arbitrary-channel');
  assert.deepEqual(actions, [['select-all']]);
  stop();
  assert.equal(removed, true);
  bridge.setDirty('invalid');
  assert.equal(invocations.length, 0);
  bridge.saveProject(project, 'Show', true);
  assert.deepEqual(invocations[0], ['squidware:save-project', project, 'Show', true]);
  bridge.beginRecovery(); bridge.readRecovery('session', 'id'); bridge.writeRecovery('session', 2, 1, { project: true });
  assert.deepEqual(invocations.slice(1), [['squidware:begin-recovery'], ['squidware:read-recovery', 'session', 'id'], ['squidware:write-recovery', 'session', 2, 1, { project: true }]]);
  bridge.readPreferences(); bridge.savePreferences({ version: 1 }); bridge.resetPreferences(); bridge.exportPdf('a4');
  assert.deepEqual(invocations.slice(4), [['squidware:read-preferences'], ['squidware:save-preferences', { version: 1 }], ['squidware:reset-preferences'], ['squidware:export-pdf', 'a4']]);
});

test('preferences IPC validates values, trusts only the editor and fixes the app-data destination', async t => {
  const h = await harness(t);
  for (const name of ['read-preferences', 'save-preferences', 'reset-preferences']) await assert.rejects(h.invokeAs(name, { sender: {}, senderFrame: h.sender.senderFrame }), /untrusted/);
  await assert.rejects(h.invoke('save-preferences', { zoom: -1 }), /zoom/);
  const value = (await h.invoke('read-preferences', '../../escape')).preferences;
  await h.invoke('save-preferences', { ...value, paperSize: 'a4', filename: '../../escape' }, '../../escape');
  assert.deepEqual(await fs.readdir(h.directory), ['preferences.json']);
  assert.equal(JSON.parse(await fs.readFile(path.join(h.directory, 'preferences.json'), 'utf8')).paperSize, 'a4');
  assert.equal((await h.invoke('reset-preferences')).paperSize, 'letter');
});

test('PDF paper defaults are allowlisted before the save dialog', async t => {
  const h = await harness(t);
  await assert.rejects(h.invoke('export-pdf', 'custom'), /Letter or A4/); assert.equal(h.saveDialogCount(), 0);
  h.dialog({ canceled: false, filePath: path.join(h.directory, 'book.pdf') });
  await h.invoke('export-pdf', 'a4'); assert.equal(h.messages.at(-1)[1].pageSize, 'A4');
  await h.invoke('export-pdf'); assert.equal(h.messages.at(-1)[1].pageSize, 'Letter');
});

test('recovery IPC uses trusted frames, fixed application data and opaque version ids', async t => {
  const h = await harness(t);
  for (const name of ['begin-recovery', 'list-recoveries', 'read-recovery', 'write-recovery', 'migrate-recovery']) {
    await assert.rejects(h.invokeAs(name, { sender: {}, senderFrame: h.sender.senderFrame }), /untrusted/);
  }
  const { session } = await h.invoke('begin-recovery', '../escape');
  const { version } = await h.invoke('write-recovery', session, 1, 1, JSON.parse(project), '../escape');
  assert.equal((await h.invoke('list-recoveries', session)).versions[0].id, version.id);
  await assert.rejects(h.invoke('read-recovery', session, '../../escape'), /Choose a recovery copy/);
  await assert.rejects(h.invoke('write-recovery', 'forged', 2, 2, JSON.parse(project)), /session expired/);
  assert.deepEqual(await fs.readdir(h.directory), ['recovery']);
  assert.ok((await h.invoke('read-recovery', session, version.id)).project.schemaVersion === 2);
});

test('native project save/open retains show snapping rules and rejects invalid rules without replacing the file', async t => {
  const h = await harness(t); const filename = path.join(h.directory, 'grid-show.squid');
  const show = JSON.parse(project); show.snapping = { steps: 6, subdivision: 4, target: 'markings', group: 'individual' };
  const content = JSON.stringify(show); h.dialog({ canceled: false, filePath: filename });
  await h.invoke('save-project', content, 'Grid show'); h.dialog({ canceled: false, filePaths: [filename] });
  assert.deepEqual(JSON.parse((await h.invoke('open-project')).content).snapping, show.snapping);
  show.snapping.steps = 7;
  await assert.rejects(h.invoke('save-project', JSON.stringify(show), 'Grid show'), /snapping/);
  assert.equal(await fs.readFile(filename, 'utf8'), content);
});
