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
async function harness(t, { failRename = false, development = false, platform = 'win32' } = {}) {
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
      this.events = new Map(); this.contentsEvents = new Map();
      this.webContents = {
        mainFrame: { url: development ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(root, 'dist', 'index.html')).href },
        on: (name, handler) => this.contentsEvents.set(name, handler), setWindowOpenHandler: handler => { this.openWindowHandler = handler; },
        send: (...args) => messages.push(args),
        setIgnoreMenuShortcuts: value => { this.ignoreMenuShortcuts = value; },
        ...Object.fromEntries(['cut','copy','paste','undo','redo','selectAll'].map(action => [action, () => messages.push(['text-edit', action])])),
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
    process: { argv: [], env: development ? { ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/' } : {}, platform },
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
    currentMenu: () => menu,
    invoke: (name, ...args) => handlers.get(`squidware:${name}`)(sender, ...args),
    invokeAs: (name, source, ...args) => handlers.get(`squidware:${name}`)(source, ...args),
    send: (name, value) => listeners.get(`squidware:${name}`)(sender, value),
    sendAs: (name, identity, value) => listeners.get(`squidware:${name}`)(identity, value),
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

test('native save/open preserves overlapping selection groups and rejects stale IDs without replacing the durable file', async t => {
  const h = await harness(t), data = JSON.parse(project), ids = data.performers.slice(0, 2).map(p => p.id);
  data.selectionGroups = [{ id: 'pair', name: 'Lead pair', performerIds: ids }, { id: 'solo', name: 'Solo', performerIds: ids.slice(0, 1) }];
  const filename = path.join(h.directory, 'groups.squid'), content = JSON.stringify(data);
  h.dialog({ canceled: false, filePath: filename }); await h.invoke('save-project', content, 'Groups');
  h.dialog({ canceled: false, filePaths: [filename] });
  const reopened = JSON.parse((await h.invoke('open-project')).content);
  assert.deepEqual(reopened.selectionGroups, data.selectionGroups); assert.deepEqual(reopened.sets, data.sets);
  const before = await fs.readFile(filename, 'utf8'); data.selectionGroups[0].performerIds.push('missing');
  await assert.rejects(h.invoke('save-project', JSON.stringify(data), 'Groups'), /existing performer/);
  assert.equal(await fs.readFile(filename, 'utf8'), before);
});

test('native save/open retains production analysis rules and directions and rejects invalid rules atomically', async t => {
  const h = await harness(t), data = JSON.parse(project), id = data.performers[0].id;
  data.analysisRules = { defaults: { minimumSpacing: 1.5, maximumStride: 1 }, sections: [{ sectionId: data.sections[0].id, minimumSpacing: 2 }], directions: { backward: { maximumStride: .5 } } }; data.moves[0].marchingDirections = { [id]: 'backward' };
  const filename = path.join(h.directory, 'rules.squid'); h.dialog({ canceled: false, filePath: filename }); await h.invoke('save-project', JSON.stringify(data), 'Rules');
  h.dialog({ canceled: false, filePaths: [filename] }); const reopened = JSON.parse((await h.invoke('open-project')).content);
  assert.deepEqual(reopened.analysisRules, data.analysisRules); assert.deepEqual(reopened.moves[0].marchingDirections, data.moves[0].marchingDirections); assert.deepEqual(reopened.sets, data.sets);
  const before = await fs.readFile(filename, 'utf8'); data.analysisRules.defaults.maximumStride = 6;
  await assert.rejects(h.invoke('save-project', JSON.stringify(data), 'Rules'), /maximumStride/); assert.equal(await fs.readFile(filename, 'utf8'), before);
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
  for (const [content, error] of [[JSON.stringify(dangling), /adjacent sets/], [JSON.stringify({ schemaVersion: 7 }), /Update Squidware/]]) {
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

test('template library IPC validates, persists separately, and imports and exports without changing the project destination', async t => {
  const h = await harness(t);
  const library = JSON.stringify({ format: 'squidware-template-library', version: 1, entries: [] });
  for (const name of ['read-template-library', 'save-template-library', 'open-template-library', 'export-template-library']) await assert.rejects(h.invokeAs(name, { sender: {}, senderFrame: h.sender.senderFrame }, library), /untrusted/);
  await assert.rejects(h.invoke('save-template-library', '{}'), /format/);
  await assert.rejects(h.invoke('export-template-library', '{}'), /format/);
  assert.equal(h.saveDialogCount(), 0);
  await h.invoke('save-template-library', library, '../../escape');
  assert.equal(JSON.parse((await h.invoke('read-template-library')).content).version, 1);
  assert.deepEqual(await fs.readdir(h.directory), ['template-library.json']);
  const projectFile = path.join(h.directory, 'show.squid'); h.dialog({ filePath: projectFile });
  await h.invoke('save-project', project, 'Show');
  const exportFile = path.join(h.directory, 'shared.squidlib'); h.dialog({ filePath: exportFile });
  assert.equal(await h.invoke('export-template-library', library), exportFile);
  h.dialog({ filePaths: [exportFile] }); assert.equal(JSON.parse(await h.invoke('open-template-library')).format, 'squidware-template-library');
  assert.equal(await h.invoke('save-project', project, 'Other title'), projectFile);
  h.dialog({ canceled: true }); assert.equal(await h.invoke('open-template-library'), null); assert.equal(await h.invoke('export-template-library', library), null);
  const badFile = path.join(h.directory, 'newer.squidlib'); await fs.writeFile(badFile, library.replace('"version":1', '"version":99'));
  h.dialog({ filePaths: [badFile] }); await assert.rejects(h.invoke('open-template-library'), /unsupported/);
  assert.equal(JSON.parse((await h.invoke('read-template-library')).content).version, 1);
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

test('native menu shortcuts follow durable preferences, reset, and trusted modal/text-entry context', async t => {
  const h = await harness(t);
  const preferences = (await h.invoke('read-preferences')).preferences;
  await h.invoke('save-preferences', { ...preferences, shortcutBindings: { 'file.save': 'Primary+Shift+U', 'history.redo': 'Primary+Shift+Y' } });
  const file = h.currentMenu().find(item => item.label === '&File').submenu;
  assert.equal(file.find(item => item.label === 'Save').accelerator, 'CmdOrCtrl+Shift+U');
  const edit = h.currentMenu().find(item => item.label === '&Edit').submenu;
  assert.equal(edit.find(item => item.label === 'Redo drill edit').accelerator, 'CmdOrCtrl+Shift+Y');
  assert.equal(edit.some(item => item.accelerator === 'Ctrl+Y'), false);
  h.send('keyboard-context', 'modal'); assert.equal(h.window.ignoreMenuShortcuts, true);
  h.send('keyboard-context', 'editor'); assert.equal(h.window.ignoreMenuShortcuts, false);
  h.send('keyboard-context', 'invalid'); assert.equal(h.window.ignoreMenuShortcuts, false);
  await h.invoke('reset-preferences');
  assert.equal(h.currentMenu().find(item => item.label === '&File').submenu.find(item => item.label === 'Save').accelerator, 'CmdOrCtrl+S');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(h.directory, 'preferences.json'), 'utf8')).shortcutBindings, {});
});

test('failed preference persistence keeps the current in-memory shortcut and does not retain its old native accelerator', async t => {
  const h = await harness(t, { failRename: true });
  const defaults = (await h.invoke('read-preferences')).preferences;
  await assert.rejects(h.invoke('save-preferences', { ...defaults, shortcutBindings: { 'file.save': 'Primary+Shift+U' } }), /disk failure/);
  const file = h.currentMenu().find(item => item.label === '&File').submenu;
  assert.equal(file.find(item => item.label === 'Save').accelerator, 'CmdOrCtrl+Shift+U');
  assert.equal(file.some(item => item.accelerator === 'CmdOrCtrl+S'), false);
});

test('macOS text editing requires a native key event in trusted text context and leaves recorder/editor keys alone', async t => {
  const h = await harness(t, { platform: 'darwin' });
  const nativeKey = h.window.contentsEvents.get('before-input-event'); let prevented = 0;
  const event = { preventDefault() { prevented++; } };
  const input = { type: 'keyDown', key: 'c', code: 'KeyC', meta: true, control: false, shift: false, alt: false };
  h.send('keyboard-context', 'text'); nativeKey(event, input);
  nativeKey(event, { ...input, key: 'a', code: 'KeyA' });
  h.sendAs('keyboard-context', { sender: {}, senderFrame: h.sender.senderFrame }, 'editor');
  nativeKey(event, { ...input, key: 'z', code: 'KeyZ', shift: true });
  h.send('keyboard-context', 'modal'); nativeKey(event, input);
  h.send('keyboard-context', 'editor'); nativeKey(event, input);
  h.send('keyboard-context', 'text'); nativeKey(event, { ...input, meta: false });
  nativeKey(event, { ...input, isComposing: true });
  assert.equal(prevented, 3);
  assert.deepEqual(h.messages.map(message => [...message]), [['text-edit', 'copy'], ['text-edit', 'selectAll'], ['text-edit', 'redo']]);
});

test('native score save/open retains musical anchors and rejects contradictory meter changes atomically', async t => {
 const h=await harness(t),data=JSON.parse(project);
 data.score={firstMeasure:1,pickupCounts:0,changes:[{count:16,meter:{numerator:3,denominator:4,grouping:[3]}}],marks:[{count:16,label:'A'}]};
 const filename=path.join(h.directory,'score.squid');h.dialog({canceled:false,filePath:filename});await h.invoke('save-project',JSON.stringify(data),'Score');
 h.dialog({canceled:false,filePaths:[filename]});const reopened=JSON.parse((await h.invoke('open-project')).content);assert.deepEqual(reopened.score,data.score);assert.deepEqual(reopened.sets,data.sets);
 const before=await fs.readFile(filename,'utf8');data.score.changes[0].count=3;await assert.rejects(h.invoke('save-project',JSON.stringify(data),'Score'),/inside a bar/);assert.equal(await fs.readFile(filename,'utf8'),before);
});

function packageWav() {
  const bytes = Buffer.alloc(16044); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(16000, 40); return bytes;
}
const packageCodec = require('../electron/audio-package.cjs');
function alterManifest(bytes, change) {
  const size = bytes.readUInt32LE(8), manifest = JSON.parse(bytes.subarray(12, 12 + size)); change(manifest);
  const json = Buffer.from(JSON.stringify(manifest)), header = Buffer.from(bytes.subarray(0, 12)); header.writeUInt32LE(json.length, 8);
  return Buffer.concat([header, json, bytes.subarray(12 + size)]);
}

test('portable bundle transfers exact project/recording bytes and offset, leaves plain Save destination intact', async t => {
  const h = await harness(t), bytes = packageWav();
  const plain = path.join(h.directory, 'show.squid'); h.dialog({ filePath: plain }); await h.invoke('save-project', project, 'Show');
  const audio = await h.invoke('stage-audio', 'recording.wav', new Uint8Array(bytes));
  const filename = path.join(h.directory, 'show.squidpack'); h.dialog({ filePath: filename, response: 1 });
  await h.invoke('export-package', project, 'Show', audio.token, 'bundle');
  assert.equal(await h.invoke('save-project', project, 'Show'), plain);
  const destination = path.join(h.directory, 'Transferred'); await fs.mkdir(destination);
  await fs.rename(filename, path.join(destination, 'renamed.squidpack'));
  h.dialog({ filePaths: [path.join(destination, 'renamed.squidpack')] }); const opened = await h.invoke('open-project');
  assert.deepEqual(JSON.parse(opened.content), JSON.parse(project)); assert.deepEqual(Buffer.from(opened.audio.bytes), bytes);
  assert.equal(opened.audio.name, 'recording.wav'); assert.equal(opened.audioWarning, undefined);
  h.dialog({ canceled: true }); assert.equal(await h.invoke('save-project', project, 'Show'), null, 'package import asks for a plain .squid destination');
});

test('relative audio survives folder rename; missing/changed recordings keep drill and offset available for explicit relink', async t => {
  const h = await harness(t), bytes = packageWav(), folder = path.join(h.directory, 'show'); await fs.mkdir(folder);
  const recording = path.join(folder, 'recording.wav'); await fs.writeFile(recording, bytes);
  h.dialog({ filePaths: [recording] }); const audio = await h.invoke('pick-audio'); assert.equal(audio.referenceAvailable, true);
  const filename = path.join(folder, 'show.squidpack'); h.dialog({ filePath: filename, response: 1 });
  await h.invoke('export-package', project, 'Show', audio.token, 'reference');
  const renamed = path.join(h.directory, 'renamed'); await fs.rename(folder, renamed);
  const moved = path.join(renamed, 'show.squidpack'); h.dialog({ filePaths: [moved] });
  assert.deepEqual(Buffer.from((await h.invoke('open-project')).audio.bytes), bytes);
  await fs.rename(path.join(renamed, 'recording.wav'), path.join(renamed, 'relinked.wav'));
  const missing = await h.invoke('open-project'); assert.deepEqual(JSON.parse(missing.content), JSON.parse(project)); assert.match(missing.audioWarning, /Missing or changed/); assert.equal(missing.audio, undefined);
  h.dialog({ filePaths: [path.join(renamed, 'relinked.wav')] }); assert.deepEqual(Buffer.from((await h.invoke('pick-audio')).bytes), bytes);
  const changed = Buffer.from(bytes); changed[100] = 1; await fs.writeFile(path.join(renamed, 'recording.wav'), changed);
  h.dialog({ filePaths: [moved] }); assert.match((await h.invoke('open-project')).audioWarning, /Missing or changed/);
});

test('package codec rejects malformed/truncated/oversized/future manifests, paths, tampered audio and extra payload without extracting', () => {
  const bytes = packageCodec.encodePackage(project, { name: 'recording.wav', bytes: packageWav() }, 'bundle');
  const badHash = Buffer.from(bytes); badHash[badHash.length - 1] ^= 1;
  for (const bad of [Buffer.from('PK archive'), bytes.subarray(0, 11), bytes.subarray(0, -1), Buffer.concat([bytes, Buffer.from('extra')]), badHash,
    alterManifest(bytes, m => m.version++), alterManifest(bytes, m => m.audio.size = packageCodec.MAX_AUDIO + 1)]) {
    assert.throws(() => packageCodec.decodePackage(bad));
  }
  const overHeader = Buffer.from(bytes); overHeader.writeUInt32LE(0xffffffff, 8); assert.throws(() => packageCodec.decodePackage(overHeader), /manifest size/);
  const reference = packageCodec.encodePackage(project, { name: 'recording.wav', bytes: packageWav() }, 'reference', 'audio/recording.wav');
  for (const name of ['../secret.wav', '/absolute.wav', 'C:/secret.wav', 'audio\\secret.wav', 'audio//secret.wav', 'audio/./secret.wav', 'CON.wav', 'audio/secret.wav ', 'audio/secret\0.wav']) {
    assert.throws(() => packageCodec.decodePackage(alterManifest(reference, m => m.audio.path = name)), /relative paths/);
  }
});

test('package import validates drill before changing destinations; untrusted IPC, stale tokens and unsupported audio fail safely', async t => {
  const h = await harness(t), filename = path.join(h.directory, 'bad.squidpack');
  const bytes = packageCodec.encodePackage(project, { name: 'recording.wav', bytes: packageWav() }, 'bundle');
  await fs.writeFile(filename, alterManifest(bytes, m => m.project.schemaVersion = 999)); h.dialog({ filePaths: [filename] });
  await assert.rejects(h.invoke('open-project'), /Update Squidware/);
  await assert.rejects(h.invoke('stage-audio', 'recording.exe', new Uint8Array(packageWav())), /Choose WAV/);
  await assert.rejects(h.invoke('stage-audio', 'recording.wav', new Uint8Array([1, 2])), /contents/);
  await assert.rejects(h.invoke('export-package', project, 'Show', 'stale-token', 'bundle'), /Attach/);
  for (const [channel, args] of [['pick-audio', []], ['stage-audio', ['recording.wav', new Uint8Array(packageWav())]], ['export-package', [project, 'Show', 'unknown', 'bundle']]]) {
    await assert.rejects(h.invokeAs(channel, { ...h.sender, senderFrame: {} }, ...args), /untrusted/);
  }
});

test('canceled/failed package export leaves prior file and explicit project save state untouched', async t => {
  for (const failRename of [false, true]) {
    const h = await harness(t, { failRename }), filename = path.join(h.directory, 'show.squidpack'); await fs.writeFile(filename, 'prior valid file');
    const audio = await h.invoke('stage-audio', 'recording.wav', new Uint8Array(packageWav()));
    h.dialog({ filePath: filename, response: 0 }); assert.equal(await h.invoke('export-package', project, 'Show', audio.token, 'bundle'), null);
    if (failRename) { h.dialog({ filePath: filename, response: 1 }); await assert.rejects(h.invoke('export-package', project, 'Show', audio.token, 'bundle'), /Simulated disk failure/); }
    assert.equal(await fs.readFile(filename, 'utf8'), 'prior valid file'); assert.deepEqual(await fs.readdir(h.directory), ['show.squidpack']);
  }
});

test('relative package refuses references outside its folder and rejects symlink escapes on import', async t => {
  const h = await harness(t), bytes = packageWav(), outside = path.join(h.directory, 'outside.wav'), inside = path.join(h.directory, 'inside');
  await fs.mkdir(inside); await fs.writeFile(outside, bytes); h.dialog({ filePaths: [outside] }); const audio = await h.invoke('pick-audio');
  const filename = path.join(inside, 'show.squidpack'); h.dialog({ filePath: filename, response: 1 });
  await assert.rejects(h.invoke('export-package', project, 'Show', audio.token, 'reference'), /relative paths/);
  assert.equal(await fs.stat(filename).catch(() => null), null);
  // Symlink creation may need OS privileges on Windows; other boundary cases still run there.
  try { await fs.symlink(outside, path.join(inside, 'recording.wav')); } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return; throw error; }
  await fs.writeFile(filename, packageCodec.encodePackage(project, { name: 'recording.wav', bytes }, 'reference', 'recording.wav'));
  h.dialog({ filePaths: [filename] }); const opened = await h.invoke('open-project'); assert.equal(opened.audio, undefined); assert.match(opened.audioWarning, /Missing or changed/);
});

test('failed decode candidates cannot evict the active recording, while successful adoption releases old attachments', async t => {
  const h = await harness(t), bytes = new Uint8Array(packageWav());
  const active = await h.invoke('stage-audio', 'active.wav', bytes); await h.invoke('use-audio', active.token);
  await h.invoke('stage-audio', 'candidate-one.wav', bytes);
  const latest = await h.invoke('stage-audio', 'candidate-two.wav', bytes);
  h.dialog({ canceled: true }); assert.equal(await h.invoke('export-package', project, 'Show', active.token, 'bundle'), null);
  await h.invoke('use-audio', latest.token);
  await assert.rejects(h.invoke('export-package', project, 'Show', active.token, 'bundle'), /Attach/);
  await assert.rejects(h.invokeAs('use-audio', { ...h.sender, senderFrame: {} }, latest.token), /untrusted/);
});

test('native package and audio readers reject oversized files before allocating payload buffers', async t => {
  const h = await harness(t), filename = path.join(h.directory, 'oversized.squidpack');
  const handle = await fs.open(filename, 'w'); await handle.truncate(packageCodec.MAX_PACKAGE + 1); await handle.close();
  h.dialog({ filePaths: [filename] }); await assert.rejects(h.invoke('open-project'), /exceeds/);
  const audioPath = path.join(h.directory, 'oversized.wav'); const audio = await fs.open(audioPath, 'w'); await audio.truncate(packageCodec.MAX_AUDIO + 1); await audio.close();
  h.dialog({ filePaths: [audioPath] }); await assert.rejects(h.invoke('pick-audio'), /exceeds/);
  await assert.rejects(h.invoke('stage-audio', 'recording.wav', { length: 1 }), /Invalid audio/);
});

test('the fixed v1 bundle fixture imports identical Linux-authored bytes on every supported platform', async t => {
  const h = await harness(t), source = path.join(root, 'src/fixtures/audio-package-v1.squidpack');
  const fixture = await fs.readFile(source);
  // Authored with independent Python struct/json/hashlib code; never regenerated by the JS exporter under test.
  assert.equal(packageCodec.digest(fixture), '88d07bb4a519564b4f45a5feecb543afc324d811a5d716dffa407ea83aa0103b');
  const transferred = path.join(h.directory, 'transferred.squidpack'); await fs.copyFile(source, transferred);
  h.dialog({ filePaths: [transferred] }); const opened = await h.invoke('open-project');
  assert.deepEqual(JSON.parse(opened.content), { ...JSON.parse(project), audioOffsetSeconds: 2 });
  assert.deepEqual(Buffer.from(opened.audio.bytes), packageWav());
});

for (const version of [3,4]) test(`schema-v${version} timing survives native saves, recovery and audio packages without a silent downgrade`, async t => {
  const h=await harness(t),wire=await fs.readFile(path.join(root,version===3?'format/examples/tempo-v3.squid':'format/examples/aligned-v4.squid'),'utf8');
  const filename=path.join(h.directory,'tempo.squid');h.dialog({filePath:filename});await h.invoke('save-project',wire,'Tempo');
  h.dialog({filePaths:[filename]});const opened=await h.invoke('open-project');assert.equal(JSON.parse(opened.content).schemaVersion,version);
  const {parseProjectV2}=require('../electron/project-codec.cjs'),canonical=parseProjectV2(opened.content);
  assert.deepEqual(canonical.tempoMap,JSON.parse(wire).tempoMap);assert.deepEqual(canonical.audioAnchors,JSON.parse(wire).audioAnchors);assert.equal(canonical.schemaVersion,2);
  const session=await h.invoke('begin-recovery');const copy=await h.invoke('write-recovery',session.session,1,1,canonical);
  const recovered=await h.invoke('read-recovery',session.session,copy.version.id);assert.deepEqual(recovered.project.tempoMap,canonical.tempoMap);assert.deepEqual(recovered.project.audioAnchors,canonical.audioAnchors);
  const audio=await h.invoke('stage-audio','recording.wav',new Uint8Array(packageWav())),pack=path.join(h.directory,'tempo.squidpack');
  h.dialog({filePath:pack,response:1});await h.invoke('export-package',wire,'Tempo',audio.token,'bundle');h.dialog({filePaths:[pack]});const imported=await h.invoke('open-project');assert.deepEqual(parseProjectV2(imported.content).tempoMap,canonical.tempoMap);assert.deepEqual(parseProjectV2(imported.content).audioAnchors,canonical.audioAnchors);
  const bad=JSON.parse(wire);bad.tempoMap.holds.push({...bad.tempoMap.holds[0]});await assert.rejects(h.invoke('save-project',JSON.stringify(bad),'Tempo'),/distinct/);assert.equal(await fs.readFile(filename,'utf8'),wire);
});

test('native v5 open/save preserves curved geometry and failed control validation leaves the file intact', async t => {
 const h=await harness(t), filename=path.join(h.directory,'curve.squid');
 const content=await fs.readFile(path.join(root,'format/examples/curved-v5.squid'),'utf8');
 await fs.writeFile(filename,content);h.dialog({canceled:false,filePaths:[filename]});
 assert.equal((await h.invoke('open-project')).content,content);
 await h.invoke('save-project',content,'Curve');
 assert.equal(await fs.readFile(filename,'utf8'),content);
 const bad=JSON.parse(content);bad.moves[0].paths.a.segments[0].control1.x=-1;
 await assert.rejects(h.invoke('save-project',JSON.stringify(bad),'Curve'),/control1/);
 assert.equal(await fs.readFile(filename,'utf8'),content);
 assert.equal(h.saveDialogCount(),0);
});

test('native v6 schedules round-trip and an overlapping interval cannot overwrite the saved production',async t=>{
 const h=await harness(t),filename=path.join(h.directory,'schedule.squid');
 const content=await fs.readFile(path.join(root,'format/examples/scheduled-v6.squid'),'utf8');
 await fs.writeFile(filename,content);h.dialog({canceled:false,filePaths:[filename]});
 assert.equal((await h.invoke('open-project')).content,content);
 assert.equal(await h.invoke('save-project',content,'Schedule'),filename);
 assert.equal(await fs.readFile(filename,'utf8'),content);
 const bad=JSON.parse(content);bad.moves[0].paths.a.segments[1].startCount=5;
 await assert.rejects(h.invoke('save-project',JSON.stringify(bad),'Schedule'),/overlaps/);
 assert.equal(await fs.readFile(filename,'utf8'),content);assert.equal(h.saveDialogCount(),0);
});
