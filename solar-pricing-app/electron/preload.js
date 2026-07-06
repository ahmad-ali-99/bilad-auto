const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  materials: {
    list: (category) => ipcRenderer.invoke('materials:list', category),
    create: (data) => ipcRenderer.invoke('materials:create', data),
    update: (id, data) => ipcRenderer.invoke('materials:update', id, data),
    remove: (id) => ipcRenderer.invoke('materials:remove', id),
    parseExcel: () => ipcRenderer.invoke('materials:parseExcel'),
    importRows: (payload) => ipcRenderer.invoke('materials:importRows', payload),
    downloadTemplate: () => ipcRenderer.invoke('materials:downloadTemplate'),
  },
  laborTiers: {
    list: () => ipcRenderer.invoke('labor:list'),
    create: (data) => ipcRenderer.invoke('labor:create', data),
    update: (id, data) => ipcRenderer.invoke('labor:update', id, data),
    remove: (id) => ipcRenderer.invoke('labor:remove', id),
  },
  quotes: {
    preview: (input) => ipcRenderer.invoke('quotes:preview', input),
    save: (input) => ipcRenderer.invoke('quotes:save', input),
    list: () => ipcRenderer.invoke('quotes:list'),
    get: (id) => ipcRenderer.invoke('quotes:get', id),
    remove: (id) => ipcRenderer.invoke('quotes:remove', id),
    exportPdf: (id) => ipcRenderer.invoke('quotes:exportPdf', id),
    exportDraftPdf: (input) => ipcRenderer.invoke('quotes:exportDraftPdf', input),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data) => ipcRenderer.invoke('settings:update', data),
  },
  company: {
    get: () => ipcRenderer.invoke('company:get'),
    update: (data) => ipcRenderer.invoke('company:update', data),
    pickLogo: () => ipcRenderer.invoke('company:pickLogo'),
  },
});
