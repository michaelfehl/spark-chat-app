const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('renderer/index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file selection for PDF upload
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'PDF Documents', extensions: ['pdf'] },
      { name: 'Text Files', extensions: ['txt', 'md'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      path: filePath,
      name: path.basename(filePath),
      content: content
    };
  }
  return null;
});

// Handle chat requests to Spark
ipcMain.handle('chat-request', async (event, { messages, useKnowledgeBase, useWebSearch }) => {
  const SPARK_URL = 'http://100.86.36.112:30000/v1/chat/completions';
  
  try {
    const response = await fetch(SPARK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: messages,
        max_tokens: 4000,
        temperature: 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      content: data.choices[0].message.content
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Check Spark connection
ipcMain.handle('check-connection', async () => {
  try {
    const response = await fetch('http://100.86.36.112:30000/v1/models', {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
});
