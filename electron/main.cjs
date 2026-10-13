'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const { parseProjectV2 } = require('./project-codec.cjs');
const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
const MAX_EXPORT_BYTES = 20 * 1024 * 1024;
const smokeTest = process.argv.includes('--smoke-test');
const smokeArtifactsArg = process.argv.find(argument => argument.startsWith('--smoke-artifacts='));
const smokeArtifacts = smokeArtifactsArg?.slice('--smoke-artifacts='.length);
if (smokeArtifactsArg && (!smokeTest || !smokeArtifacts || !path.isAbsolute(smokeArtifacts))) {
  throw new Error('--smoke-artifacts requires --smoke-test and an absolute output directory.');
}
const appFile = path.join(__dirname, '..', 'dist', 'index.html');
const packagedUrl = pathToFileURL(appFile).href;
let window;
let savedPath = null;
let dirty = false;
let closingDialog = false;
let discardOnClose = false;
let fileOperationActive = false;

function developmentUrl() {
  if (app.isPackaged || !process.env.ELECTRON_RENDERER_URL) return null;
  const url = new URL(process.env.ELECTRON_RENDERER_URL);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('ELECTRON_RENDERER_URL must be a loopback HTTP server root.');
  }
  return url.href;
}

const devUrl = developmentUrl();
const rendererUrl = devUrl || packagedUrl;

// Smoke runs must not read or overwrite a designer's recovery project.
if (smokeTest) {
  const profile = path.join(app.getPath('temp'), `squidware-smoke-${process.pid}`);
  require('node:fs').mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
}

function isAppUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href === rendererUrl;
  } catch { return false; }
}

function assertSender(event) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame || !isAppUrl(event.senderFrame.url)) {
    throw new Error('Rejected an untrusted desktop request.');
  }
}

function assertText(content, limit) {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > limit) {
    throw new Error(`File content must be text smaller than ${limit / 1024 / 1024} MB.`);
  }
}

function validateProject(content) {
  assertText(content, MAX_PROJECT_BYTES);
  parseProjectV2(content);
}

function safeFilename(name, extension) {
  if (typeof name !== 'string' || !name.trim() || name.length > 180
      || name !== path.basename(name) || /[<>:"/\\|?*\x00-\x1f]/.test(name)
      || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error('Choose a plain filename without reserved characters.');
  }
  return name.toLowerCase().endsWith(`.${extension}`) ? name : `${name}.${extension}`;
}

function ensureExtension(filename, extension) {
  return filename.toLowerCase().endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
}

async function selectedDestination(filename, extension) {
  const destination = ensureExtension(filename, extension);
  // Some Linux dialogs do not append their selected extension. If adding it
  // changes the path, their built-in overwrite confirmation covered another file.
  if (destination !== filename) {
    const exists = await fs.stat(destination).then(() => true, (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    if (exists) {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Replace existing file?',
        message: `Replace ${path.basename(destination)}?`,
        detail: 'A file with this name already exists in the selected folder.',
        buttons: ['Cancel', 'Replace'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (response !== 1) return null;
    }
  }
  return destination;
}

// Write beside the destination and rename only after the complete contents reach disk.
// On failure, the prior project remains untouched and only our temporary file is removed.
async function atomicWrite(filename, content) {
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, filename);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

function handleFileRequest(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertSender(event);
    if (fileOperationActive) throw new Error('Finish the current file dialog before opening another.');
    fileOperationActive = true;
    try { return await handler(...args); } finally { fileOperationActive = false; }
  });
}

function registerIpc() {
  handleFileRequest('squidware:open-project', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Squidware project',
      filters: [{ name: 'Squidware projects', extensions: ['squid', 'json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filename = result.filePaths[0];
    if (!['.squid', '.json'].includes(path.extname(filename).toLowerCase())) {
      throw new Error('Choose a .squid or .json project file.');
    }
    const handle = await fs.open(filename, 'r');
    let content;
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size > MAX_PROJECT_BYTES) throw new Error('Project files must be smaller than 10 MB.');
      // Limit actual reads as well as stat size, even if another process grows
      // this file after it was opened.
      const buffer = Buffer.alloc(MAX_PROJECT_BYTES + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset > MAX_PROJECT_BYTES) throw new Error('Project files must be smaller than 10 MB.');
      content = buffer.subarray(0, offset).toString('utf8');
    } finally { await handle.close(); }
    validateProject(content);
    // JSON imports receive a new .squid destination on their first save.
    savedPath = path.extname(filename).toLowerCase() === '.squid' ? filename : null;
    return { content, path: filename };
  });

  handleFileRequest('squidware:save-project', async (content, suggestedName, saveAs = false) => {
    validateProject(content);
    const name = safeFilename(suggestedName, 'squid');
    if (typeof saveAs !== 'boolean') throw new Error('Invalid Save As option.');
    let filename = savedPath;
    if (!filename || saveAs) {
      const result = await dialog.showSaveDialog(window, {
        title: 'Save Squidware project',
        defaultPath: savedPath || name,
        filters: [{ name: 'Squidware project', extensions: ['squid'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory'],
      });
      if (result.canceled || !result.filePath) return null;
      filename = await selectedDestination(result.filePath, 'squid');
      if (!filename) return null;
    }
    await atomicWrite(filename, content);
    savedPath = filename;
    return filename;
  });

  handleFileRequest('squidware:export-file', async (content, suggestedName, kind) => {
    if (!['csv', 'svg', 'html'].includes(kind)) throw new Error('Unsupported export format.');
    assertText(content, MAX_EXPORT_BYTES);
    const name = safeFilename(suggestedName, kind);
    const result = await dialog.showSaveDialog(window, {
      title: `Export ${kind.toUpperCase()}`,
      defaultPath: name,
      filters: [{ name: `${kind.toUpperCase()} document`, extensions: [kind] }],
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
    if (result.canceled || !result.filePath) return null;
    const filename = await selectedDestination(result.filePath, kind);
    if (!filename) return null;
    await atomicWrite(filename, content);
    return filename;
  });

  handleFileRequest('squidware:export-pdf', async () => {
    const result = await dialog.showSaveDialog(window, {
      title: 'Export drill book PDF',
      defaultPath: 'Squidware-drill-book.pdf',
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
    if (result.canceled || !result.filePath) return null;
    const filename = await selectedDestination(result.filePath, 'pdf');
    if (!filename) return null;
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'Letter',
      margins: { top: 0.35, bottom: 0.35, left: 0.35, right: 0.35 },
    });
    await atomicWrite(filename, pdf);
    return filename;
  });

  ipcMain.on('squidware:set-dirty', (event, value) => {
    try { assertSender(event); } catch { return; }
    if (typeof value !== 'boolean') return;
    dirty = value;
    window.setDocumentEdited(dirty);
  });
  ipcMain.on('squidware:reset-project', (event) => {
    try { assertSender(event); } catch { return; }
    savedPath = null;
  });
}

function sendAction(action) {
  if (window && !window.isDestroyed()) window.webContents.send('squidware:menu-action', action);
}

function installMenu() {
  const isMac = process.platform === 'darwin';
  const action = (label, command, accelerator) => ({ label, accelerator, click: () => sendAction(command) });
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [action('About Squidware', 'about'), { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: '&File', submenu: [
      action('New project', 'new', 'CmdOrCtrl+N'),
      action('Open project…', 'open', 'CmdOrCtrl+O'),
      { type: 'separator' },
      action('Save', 'save', 'CmdOrCtrl+S'),
      action('Save As…', 'save-as', 'CmdOrCtrl+Shift+S'),
      { type: 'separator' },
      action('Export drill book PDF…', 'export-pdf', 'CmdOrCtrl+P'),
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { label: '&Edit', submenu: [
      action('Undo drill edit', 'undo', 'CmdOrCtrl+Z'),
      action('Redo drill edit', 'redo', 'CmdOrCtrl+Shift+Z'),
      ...(!isMac ? [{ ...action('Redo', 'redo', 'Ctrl+Y'), visible: false }] : []),
      { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      action('Select all', 'select-all', 'CmdOrCtrl+A'),
    ] },
    { label: '&View', submenu: [
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
      ...(!app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
    ] },
    { label: '&Help', submenu: [action('Keyboard shortcuts', 'shortcuts', 'F1'), action('About Squidware', 'about')] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function installSecurity() {
  const activeSession = session.defaultSession;
  activeSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  activeSession.setPermissionCheckHandler(() => false);
  activeSession.on('will-download', (event) => event.preventDefault());
  const connection = devUrl ? `'self' ${devUrl} ${devUrl.replace('http:', 'ws:')}` : "'none'";
  const scripts = devUrl ? "'self' 'nonce-squidware-dev'" : "'self'";
  const csp = `default-src 'self'; script-src ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src ${connection}; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`;
  activeSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'content-security-policy') delete responseHeaders[key];
    }
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
}

function createWindow() {
  savedPath = null;
  dirty = false;
  discardOnClose = false;
  window = new BrowserWindow({
    width: 1520, height: 980, minWidth: 1120, minHeight: 720,
    title: 'Squidware', backgroundColor: '#151d1c', show: false,
    icon: path.join(__dirname, '..', 'dist', 'icon512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
      spellcheck: false, offscreen: smokeTest && Boolean(smokeArtifacts),
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  const firstPaint = new Promise(resolve => window.once('ready-to-show', resolve));
  window.once('ready-to-show', () => { if (!smokeTest) window.show(); });
  window.on('close', (event) => {
    if (!dirty || discardOnClose || smokeTest) return;
    event.preventDefault();
    if (closingDialog) return;
    closingDialog = true;
    dialog.showMessageBox(window, {
      type: 'warning', title: 'Unsaved project',
      message: 'Discard unsaved changes?',
      detail: 'Your latest edits have not been saved to a project file. Cancel to return to your project and save them.',
      buttons: ['Cancel', 'Discard changes'], defaultId: 0, cancelId: 0, noLink: true,
    }).then(({ response }) => {
      if (response === 1 && window && !window.isDestroyed()) {
        discardOnClose = true;
        window.close();
      }
    }).finally(() => { closingDialog = false; });
  });
  window.on('closed', () => { window = null; });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    if (smokeTest) { console.error(`Desktop smoke load failed: ${code} ${description}`); app.exit(1); }
  });
  if (smokeTest) {
    const timeout = setTimeout(() => { console.error('Desktop smoke test timed out.'); app.exit(1); }, 30000);
    window.webContents.once('did-finish-load', async () => {
      try {
        const state = await window.webContents.executeJavaScript(`new Promise(resolve => {
          const started = Date.now();
          const check = () => {
            const studio = !!document.querySelector('.studio');
            const field = !!document.querySelector('.field-stage .field-stage__svg');
            const fatal = document.querySelector('.fatal-error')?.textContent || '';
            if ((studio && field) || fatal || Date.now() - started > 10000) {
              resolve({ title: document.title, bridge: !!window.squidware && typeof window.squidware.openProject === 'function', studio, field, fatal, performers: document.querySelectorAll('.field-stage .field-performer').length, sets: document.querySelectorAll('.set-card').length, node: typeof window.require });
            } else setTimeout(check, 50);
          }; check();
        })`);
        if (!state.title.includes('Squidware') || !state.bridge || !state.studio || !state.field
            || state.fatal || state.performers < 1 || state.sets < 1 || state.node !== 'undefined') {
          throw new Error(`Unexpected renderer state: ${JSON.stringify(state)}`);
        }
        if (smokeArtifacts) {
          await firstPaint;
          const screenshot = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
          if (screenshot.isEmpty()) throw new Error('Desktop screenshot was empty.');
          await fs.mkdir(smokeArtifacts, { recursive: true });
          await atomicWrite(path.join(smokeArtifacts, 'desktop-smoke.png'), screenshot.toPNG());
          await atomicWrite(path.join(smokeArtifacts, 'desktop-smoke.json'), `${JSON.stringify(state, null, 2)}\n`);
        }
        clearTimeout(timeout);
        console.log(`Desktop smoke test passed: ${JSON.stringify(state)}`);
        app.exit(0);
      } catch (error) { console.error(error); app.exit(1); }
    });
  }
  window.loadURL(rendererUrl).catch((error) => {
    console.error('Unable to load Squidware:', error.message);
    if (smokeTest) app.exit(1);
    else dialog.showErrorBox('Squidware could not start', 'The application files could not be loaded. Run pnpm build before pnpm start, or reinstall the desktop application.');
  });
}

app.setName('Squidware');
if (!app.requestSingleInstanceLock() && !smokeTest) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
  app.whenReady().then(() => { installSecurity(); registerIpc(); installMenu(); createWindow(); }).catch((error) => {
    console.error('Desktop startup failed:', error);
    if (!smokeTest) dialog.showErrorBox('Squidware could not start', error.message);
    app.exit(1);
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
