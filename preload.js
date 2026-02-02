const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sparkAPI', {
  // Chat
  sendMessage: (messages, options) => 
    ipcRenderer.invoke('chat-request', { messages, ...options }),
  checkConnection: () => 
    ipcRenderer.invoke('check-connection'),
  webSearch: (query) =>
    ipcRenderer.invoke('web-search', query),
  
  // File upload
  selectFile: () => 
    ipcRenderer.invoke('select-file'),
  
  // Knowledge Base - Read
  getKnowledgeBase: () =>
    ipcRenderer.invoke('get-knowledge-base'),
  readKBFiles: (filePaths) =>
    ipcRenderer.invoke('read-kb-files', filePaths),
  
  // Knowledge Base - Manage
  kbCreateFolder: (path) =>
    ipcRenderer.invoke('kb-create-folder', path),
  kbDelete: (path) =>
    ipcRenderer.invoke('kb-delete', path),
  kbRename: (oldPath, newName) =>
    ipcRenderer.invoke('kb-rename', oldPath, newName),
  kbCreateFile: (path, content) =>
    ipcRenderer.invoke('kb-create-file', path, content),
  kbSaveFile: (path, content) =>
    ipcRenderer.invoke('kb-save-file', path, content),
  kbOpenFinder: () =>
    ipcRenderer.invoke('kb-open-finder'),
  
  // KB Browser Window
  kbOpenWindow: (selectedFiles) =>
    ipcRenderer.invoke('kb-open-window', selectedFiles),
  kbHandleDrop: (paths, targetFolder) =>
    ipcRenderer.invoke('kb-handle-drop', paths, targetFolder),
  kbCloseWindow: () =>
    ipcRenderer.invoke('kb-close-window'),
  kbSendSelection: (selectedFiles) =>
    ipcRenderer.send('kb-selection-changed', selectedFiles),
  
  // Event listeners
  onKBSelectionUpdate: (callback) =>
    ipcRenderer.on('kb-selection-update', (event, files) => callback(files)),
  onInitSelection: (callback) =>
    ipcRenderer.on('init-selection', (event, files) => callback(files)),
  
  // Assistants
  getAssistants: () =>
    ipcRenderer.invoke('get-assistants'),
  saveAssistant: (assistant) =>
    ipcRenderer.invoke('save-assistant', assistant),
  deleteAssistant: (id) =>
    ipcRenderer.invoke('delete-assistant', id)
});
