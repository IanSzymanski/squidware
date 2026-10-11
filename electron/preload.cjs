'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const menuActions = new Set(['new', 'open', 'save', 'save-as', 'undo', 'redo', 'select-all', 'export-pdf', 'about', 'shortcuts']);

// Expose fixed operations only. The renderer never receives ipcRenderer, Node,
// arbitrary IPC channels, filesystem primitives, or Electron event objects.
contextBridge.exposeInMainWorld('squidware', Object.freeze({
  platform: process.platform,
  openProject: () => ipcRenderer.invoke('squidware:open-project'),
  saveProject: (content, suggestedName, saveAs = false) => ipcRenderer.invoke('squidware:save-project', content, suggestedName, saveAs),
  exportFile: (content, suggestedName, kind) => ipcRenderer.invoke('squidware:export-file', content, suggestedName, kind),
  exportPdf: () => ipcRenderer.invoke('squidware:export-pdf'),
  setDirty: (dirty) => { if (typeof dirty === 'boolean') ipcRenderer.send('squidware:set-dirty', dirty); },
  resetProject: () => ipcRenderer.send('squidware:reset-project'),
  onMenuAction: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A menu callback is required.');
    const listener = (_event, action) => { if (menuActions.has(action)) callback(action); };
    ipcRenderer.on('squidware:menu-action', listener);
    return () => ipcRenderer.removeListener('squidware:menu-action', listener);
  },
}));
