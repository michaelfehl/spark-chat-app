const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Brave Search API key (get free key at https://brave.com/search/api/)
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSAcz5U2xM27VNzkhVmvBlDiSiA1F8a';

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

// Handle file selection for PDF/text upload
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'txt', 'md'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      let content;
      
      if (ext === '.pdf') {
        // Parse PDF using pdf-parse
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        content = pdfData.text;
        console.log(`Parsed PDF: ${pdfData.numpages} pages, ${content.length} chars`);
      } else {
        // Read text files directly
        content = fs.readFileSync(filePath, 'utf-8');
      }
      
      return {
        path: filePath,
        name: path.basename(filePath),
        content: content,
        type: ext
      };
    } catch (error) {
      console.error('File read error:', error);
      return {
        path: filePath,
        name: path.basename(filePath),
        content: `[Error reading file: ${error.message}]`,
        type: ext,
        error: true
      };
    }
  }
  return null;
});

// Web search using Brave Search API
async function performWebSearch(query) {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const data = await response.json();
    const results = data.web?.results || [];
    
    // Format results for context
    const formatted = results.map((r, i) => 
      `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.description || ''}`
    ).join('\n\n');
    
    return {
      success: true,
      results: formatted,
      count: results.length
    };
  } catch (error) {
    console.error('Web search error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Handle chat requests to Spark
ipcMain.handle('chat-request', async (event, { messages, useKnowledgeBase, useWebSearch, searchQuery }) => {
  const SPARK_URL = 'http://100.86.36.112:30000/v1/chat/completions';
  
  try {
    let contextMessages = [...messages];
    
    // If web search is enabled, search for relevant info
    if (useWebSearch && messages.length > 0) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (lastUserMessage) {
        const searchResult = await performWebSearch(lastUserMessage.content);
        
        if (searchResult.success && searchResult.count > 0) {
          // Insert search results as system context
          const searchContext = {
            role: 'system',
            content: `Web search results for context:\n\n${searchResult.results}\n\nUse these results to inform your response if relevant.`
          };
          
          // Insert after the first system message
          const systemIndex = contextMessages.findIndex(m => m.role === 'system');
          if (systemIndex >= 0) {
            contextMessages.splice(systemIndex + 1, 0, searchContext);
          } else {
            contextMessages.unshift(searchContext);
          }
        }
      }
    }
    
    const response = await fetch(SPARK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: contextMessages,
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
      content: data.choices[0].message.content,
      webSearchUsed: useWebSearch
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Standalone web search handler
ipcMain.handle('web-search', async (event, query) => {
  return await performWebSearch(query);
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
