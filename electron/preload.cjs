'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const menuActions = new Set(['new', 'open', 'save', 'save-as', 'undo', 'redo', 'select-all', 'export-pdf', 'about', 'shortcuts', 'commands', 'preferences']);

// Expose fixed operations only. The renderer never receives ipcRenderer, Node,
// arbitrary IPC channels, filesystem primitives, or Electron event objects.
contextBridge.exposeInMainWorld('squidware', Object.freeze({
  platform: process.platform,
  readPreferences: () => ipcRenderer.invoke('squidware:read-preferences'),
  savePreferences: preferences => ipcRenderer.invoke('squidware:save-preferences', preferences),
  resetPreferences: () => ipcRenderer.invoke('squidware:reset-preferences'),
  beginRecovery: () => ipcRenderer.invoke('squidware:begin-recovery'),
  listRecoveries: session => ipcRenderer.invoke('squidware:list-recoveries', session),
  readRecovery: (session, id) => ipcRenderer.invoke('squidware:read-recovery', session, id),
  writeRecovery: (session, sequence, revision, project) => ipcRenderer.invoke('squidware:write-recovery', session, sequence, revision, project),
  migrateRecovery: (session, content) => ipcRenderer.invoke('squidware:migrate-recovery', session, content),
  openProject: () => ipcRenderer.invoke('squidware:open-project'),
  saveProject: (content, suggestedName, saveAs = false) => ipcRenderer.invoke('squidware:save-project', content, suggestedName, saveAs),
  exportFile: (content, suggestedName, kind) => ipcRenderer.invoke('squidware:export-file', content, suggestedName, kind),
  exportPdf: paper => paper === undefined ? ipcRenderer.invoke('squidware:export-pdf') : ipcRenderer.invoke('squidware:export-pdf', paper),
  setDirty: (dirty) => { if (typeof dirty === 'boolean') ipcRenderer.send('squidware:set-dirty', dirty); },
  setMenuShortcutsEnabled: enabled => { if (typeof enabled === 'boolean') ipcRenderer.send('squidware:menu-shortcuts', enabled); },
  resetProject: () => ipcRenderer.send('squidware:reset-project'),
  onMenuAction: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A menu callback is required.');
    const listener = (_event, action) => { if (menuActions.has(action)) callback(action); };
    ipcRenderer.on('squidware:menu-action', listener);
    return () => ipcRenderer.removeListener('squidware:menu-action', listener);
  },
}));
