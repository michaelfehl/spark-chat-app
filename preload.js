const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sparkAPI', {
  sendMessage: (messages, options) => 
    ipcRenderer.invoke('chat-request', { messages, ...options }),
  selectFile: () => 
    ipcRenderer.invoke('select-file'),
  checkConnection: () => 
    ipcRenderer.invoke('check-connection')
});
